import crypto from 'crypto';
import semver from 'semver';
import { getDatabase } from '../database/connection';
import { SafeXmlValidatorService } from './xml-validator.service';
import { PackageStorageService } from './package-storage.service';
import { TaxonomyService } from './taxonomy.service';
import {
  PackageManifest,
  PackageSearchResult,
  PackageDetailResult,
} from '../types/package.types';

export interface PackageSearchFilters {
  q?: string;
  subject?: string;
  level?: string;
  grade?: string;
  canton?: string;
  license?: string;
  qtype?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Decodes HTML entities in plain-text metadata (older plugin versions sent "Computer &amp; X"). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export class PackageService {
  private static instance: PackageService | null = null;
  private readonly storage: PackageStorageService;
  private readonly taxonomy: TaxonomyService;

  constructor() {
    this.storage = PackageStorageService.getInstance();
    this.taxonomy = TaxonomyService.getInstance();
  }

  public static getInstance(): PackageService {
    if (!PackageService.instance) {
      PackageService.instance = new PackageService();
    }
    return PackageService.instance;
  }

  /**
   * Publishes a new package release.
   */
  public async publishPackage(
    ownerId: string,
    manifest: PackageManifest,
    rawXml: string
  ): Promise<{
    package_id: string;
    version: string;
    sha256: string;
    file_size_bytes: number;
    question_count: number;
    qtypes_breakdown: Record<string, number>;
    download_url: string;
    created_at: string;
  }> {
    const knex = getDatabase();

    // 1. Validate XML package
    const report = SafeXmlValidatorService.validatePackage(rawXml);
    if (!report.valid) {
      const firstErr = report.diagnostics.errors[0]?.message || 'Ungültiges XML-Fragenpaket';
      const err = new Error(`BAD_REQUEST: ${firstErr}`);
      (err as any).diagnostics = report.diagnostics;
      throw err;
    }

    // 2. Validate SemVer format
    if (!semver.valid(manifest.version)) {
      throw new Error(`BAD_REQUEST: Ungültige SemVer-Version: '${manifest.version}'.`);
    }

    // 3. Check existing package
    const existingPackage = await knex('packages').where({ id: manifest.id }).first();
    if (existingPackage) {
      const sameVersion = await knex('releases')
        .where({ package_id: manifest.id, version: manifest.version })
        .first();
      if (sameVersion) {
        throw new Error(
          `CONFLICT: Version ${manifest.version} existiert bereits oder ist nicht höher als die aktuelle Version ${existingPackage.latest_version} (zurückgezogene Versionen bleiben gesperrt).`
        );
      }
      if (existingPackage.owner_id !== ownerId) {
        throw new Error('FORBIDDEN: Sie sind nicht berechtigt, neue Versionen dieses Pakets zu veröffentlichen.');
      }

      // Monotonic SemVer check
      if (!semver.gt(manifest.version, existingPackage.latest_version)) {
        throw new Error(
          `CONFLICT: Version ${manifest.version} existiert bereits oder ist nicht höher als die aktuelle Version ${existingPackage.latest_version}.`
        );
      }
    }

    // 4. Validate taxonomy
    const taxCheck = this.taxonomy.validateTaxonomy({
      subject: manifest.taxonomy?.subject,
      level: manifest.taxonomy?.subject_category || manifest.taxonomy?.level,
      grades: manifest.taxonomy?.grades,
      canton: manifest.taxonomy?.canton,
    });
    if (!taxCheck.valid) {
      throw new Error(`BAD_REQUEST: Taxonomie-Validierung fehlgeschlagen: ${taxCheck.errors.join('; ')}`);
    }

    // 5. Stage upload and compute SHA-256
    const staged = await this.storage.stageUpload(rawXml);

    // 6. Commit release in CAS storage
    const committed = await this.storage.commitRelease(
      staged.tempPath,
      staged.sha256,
      manifest.id,
      manifest.version,
      manifest
    );

    // 7. Persist records in database transaction
    const releaseId = crypto.randomUUID();
    const now = new Date();

    await knex.transaction(async trx => {
      if (!existingPackage) {
        await trx('packages').insert({
          id: manifest.id,
          owner_id: ownerId,
          title: decodeEntities(manifest.title.trim()),
          summary: decodeEntities(manifest.summary.trim()),
          language: manifest.language || 'de-CH',
          license: manifest.license || 'CC-BY-4.0',
          framework: manifest.taxonomy?.framework || 'CH-EDK-RLP',
          subject: manifest.taxonomy?.subject || 'Informatik',
          subject_category: manifest.taxonomy?.subject_category || manifest.taxonomy?.level || 'GF',
          topic: manifest.taxonomy?.topic || null,
          canton: manifest.taxonomy?.canton || null,
          latest_version: manifest.version,
          downloads_count: 0,
          is_monetised: false,
          preview_enabled: manifest.preview_enabled !== false,
          created_at: now,
          updated_at: now,
        });

        // Insert grades
        if (manifest.taxonomy?.grades && Array.isArray(manifest.taxonomy.grades)) {
          for (const g of manifest.taxonomy.grades) {
            await trx('package_grades').insert({
              package_id: manifest.id,
              grade: g,
            });
          }
        }

        // Insert tags
        if (manifest.taxonomy?.tags && Array.isArray(manifest.taxonomy.tags)) {
          for (const t of manifest.taxonomy.tags) {
            await trx('package_tags').insert({
              package_id: manifest.id,
              tag: t.trim(),
            });
          }
        }
      } else {
        await trx('packages')
          .where({ id: manifest.id })
          .update({
            latest_version: manifest.version,
            title: decodeEntities(manifest.title.trim()),
            summary: decodeEntities(manifest.summary.trim()),
            subject: manifest.taxonomy?.subject || existingPackage.subject,
            subject_category: manifest.taxonomy?.subject_category || manifest.taxonomy?.level || existingPackage.subject_category,
            topic: manifest.taxonomy?.topic ?? existingPackage.topic,
            canton: manifest.taxonomy?.canton ?? existingPackage.canton,
            preview_enabled:
              manifest.preview_enabled === undefined
                ? existingPackage.preview_enabled
                : manifest.preview_enabled !== false,
            updated_at: now,
          });
      }

      // Insert release record
      await trx('releases').insert({
        id: releaseId,
        package_id: manifest.id,
        version: manifest.version,
        sha256: staged.sha256,
        file_path: committed.artifactPath,
        file_size_bytes: staged.sizeBytes,
        question_count: report.stats.question_count,
        qtypes_json: JSON.stringify(report.stats.qtypes_breakdown),
        categories_json: JSON.stringify(report.stats.categories),
        release_notes: manifest.release_notes || null,
        is_yanked: false,
        created_at: now,
      });
    });

    return {
      package_id: manifest.id,
      version: manifest.version,
      sha256: staged.sha256,
      file_size_bytes: staged.sizeBytes,
      question_count: report.stats.question_count,
      qtypes_breakdown: report.stats.qtypes_breakdown,
      download_url: `/api/v1/packages/${manifest.id}/releases/${manifest.version}/download`,
      created_at: now.toISOString(),
    };
  }

  /**
   * Search packages with multifaceted filtering and pagination.
   */
  public async searchPackages(filters: PackageSearchFilters): Promise<{
    data: PackageSearchResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  }> {
    const knex = getDatabase();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    let query = knex('packages')
      .join('users', 'packages.owner_id', 'users.id')
      .select(
        'packages.*',
        'users.full_name as author_name',
        'users.institution as author_institution',
        'users.canton as author_canton'
      );

    // Filter by subject
    if (filters.subject) {
      query = query.where(function() {
        this.whereRaw('LOWER(packages.subject) = ?', [filters.subject!.toLowerCase()])
            .orWhere('packages.subject', 'like', `%${filters.subject}%`);
      });
    }

    // Filter by level / category
    if (filters.level) {
      query = query.where({ 'packages.subject_category': filters.level.toUpperCase() });
    }

    // Filter by canton
    if (filters.canton) {
      query = query.where({ 'packages.canton': filters.canton.toUpperCase() });
    }

    // Filter by license
    if (filters.license) {
      query = query.where({ 'packages.license': filters.license });
    }

    // Filter by grade
    if (filters.grade) {
      query = query.whereExists(function() {
        this.select('*')
          .from('package_grades')
          .whereRaw('package_grades.package_id = packages.id')
          .andWhere('package_grades.grade', filters.grade!.toUpperCase());
      });
    }

    // Free text query
    if (filters.q) {
      const qLower = `%${filters.q.toLowerCase()}%`;
      query = query.where(function() {
        this.whereRaw('LOWER(packages.title) LIKE ?', [qLower])
          .orWhereRaw('LOWER(packages.summary) LIKE ?', [qLower])
          .orWhereRaw('LOWER(packages.topic) LIKE ?', [qLower])
          .orWhereRaw('LOWER(packages.id) LIKE ?', [qLower])
          .orWhereRaw('LOWER(users.full_name) LIKE ?', [qLower]);
      });
    }

    // Total count query
    const countResult = await query.clone().clearSelect().count<{ count: number | string }>('packages.id as count').first();
    const total = Number(countResult?.count || 0);

    // Sorting
    if (filters.sort === 'downloads:desc' || filters.sort === 'downloads') {
      query = query.orderBy('packages.downloads_count', 'desc');
    } else if (filters.sort === 'title:asc' || filters.sort === 'title') {
      query = query.orderBy('packages.title', 'asc');
    } else if (filters.sort === 'created_at:desc') {
      query = query.orderBy('packages.created_at', 'desc');
    } else {
      query = query.orderBy('packages.updated_at', 'desc');
    }

    const rows = await query.limit(limit).offset(offset);

    // Fetch related releases, tags, grades
    const packageIds = rows.map(r => r.id);
    const releases = packageIds.length > 0 ? await knex('releases').whereIn('package_id', packageIds).where({ is_yanked: false }) : [];
    const tags = packageIds.length > 0 ? await knex('package_tags').whereIn('package_id', packageIds) : [];
    const grades = packageIds.length > 0 ? await knex('package_grades').whereIn('package_id', packageIds) : [];

    const data: PackageSearchResult[] = rows.map(row => {
      const pkgReleases = releases.filter(r => r.package_id === row.id);
      const pkgTags = tags.filter(t => t.package_id === row.id).map(t => t.tag);
      const pkgGrades = grades.filter(g => g.package_id === row.id).map(g => g.grade);

      const latestRelease = pkgReleases.find(r => r.version === row.latest_version) || pkgReleases[0];
      let categoriesCount = 0;
      let questionCount = 0;
      let qtypesBreakdown: Record<string, number> = {};

      if (latestRelease) {
        questionCount = latestRelease.question_count;
        try {
          const cats = JSON.parse(latestRelease.categories_json);
          categoriesCount = Array.isArray(cats) ? cats.length : 1;
        } catch {}
        try {
          qtypesBreakdown = JSON.parse(latestRelease.qtypes_json);
        } catch {}
      }

      return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        language: row.language,
        license: row.license,
        author: {
          id: row.owner_id,
          name: row.author_name,
          institution: row.author_institution,
          canton: row.author_canton,
        },
        taxonomy: {
          framework: row.framework,
          canton: row.canton || undefined,
          level: 'GYM_SEK_II',
          grades: pkgGrades,
          subject_category: row.subject_category,
          subject: row.subject,
          topic: row.topic || undefined,
          tags: pkgTags,
        },
        latest_version: row.latest_version,
        versions: pkgReleases.map(r => r.version),
        preview_enabled: !!row.preview_enabled,
        stats: {
          question_count: questionCount,
          categories_count: categoriesCount,
          downloads_count: row.downloads_count,
          qtypes_breakdown: qtypesBreakdown,
        },
        compatibility: {
          min_moodle_version: '4.5',
          tested_versions: ['4.5', '5.0'],
        },
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single package by ID with release history and question breakdown.
   */
  public async getPackage(packageId: string): Promise<PackageDetailResult | null> {
    const knex = getDatabase();

    const row = await knex('packages')
      .join('users', 'packages.owner_id', 'users.id')
      .where({ 'packages.id': packageId })
      .select(
        'packages.*',
        'users.full_name as author_name',
        'users.institution as author_institution',
        'users.canton as author_canton'
      )
      .first();

    if (!row) return null;

    const releases = await knex('releases')
      .where({ package_id: packageId, is_yanked: false })
      .orderBy('created_at', 'desc');

    const tags = await knex('package_tags').where({ package_id: packageId });
    const grades = await knex('package_grades').where({ package_id: packageId });

    const latestRelease = releases.find(r => r.version === row.latest_version) || releases[0];
    let categories: string[] = [];
    let qtypesBreakdown: Record<string, number> = {};

    if (latestRelease) {
      try {
        categories = JSON.parse(latestRelease.categories_json);
      } catch {}
      try {
        qtypesBreakdown = JSON.parse(latestRelease.qtypes_json);
      } catch {}
    }

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      language: row.language,
      license: row.license,
      author: {
        id: row.owner_id,
        name: row.author_name,
        institution: row.author_institution,
        canton: row.author_canton,
      },
      taxonomy: {
        framework: row.framework,
        canton: row.canton || undefined,
        level: 'GYM_SEK_II',
        grades: grades.map(g => g.grade),
        subject_category: row.subject_category,
        subject: row.subject,
        topic: row.topic || undefined,
        tags: tags.map(t => t.tag),
      },
      latest_version: row.latest_version,
      versions: releases.map(r => r.version),
      preview_enabled: !!row.preview_enabled,
      stats: {
        question_count: latestRelease ? latestRelease.question_count : 0,
        categories_count: categories.length,
        downloads_count: row.downloads_count,
        qtypes_breakdown: qtypesBreakdown,
      },
      categories,
      releases: releases.map(r => ({
        version: r.version,
        sha256: r.sha256,
        file_size_bytes: Number(r.file_size_bytes),
        question_count: r.question_count,
        release_notes: r.release_notes || undefined,
        download_url: `/api/v1/packages/${packageId}/releases/${r.version}/download`,
        created_at: new Date(r.created_at).toISOString(),
      })),
      compatibility: {
        min_moodle_version: '4.5',
        tested_versions: ['4.5', '5.0'],
      },
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  public async getRelease(packageId: string, version: string): Promise<any | null> {
    const knex = getDatabase();
    if (version === 'latest') {
      const pkg = await knex('packages').where({ id: packageId }).first();
      if (!pkg) return null;
      version = pkg.latest_version;
    }

    const release = await knex('releases')
      .where({ package_id: packageId, version, is_yanked: false })
      .first();

    return release || null;
  }

  /**
   * Edits mutable package settings. Release contents and version numbers are immutable;
   * to change a version, publish a new one or withdraw the old one.
   */
  public async updatePackage(
    ownerId: string,
    isAdmin: boolean,
    packageId: string,
    patch: {
      title?: string;
      summary?: string;
      license?: string;
      canton?: string | null;
      topic?: string | null;
      subject?: string;
      subject_category?: string;
      grades?: string[];
      tags?: string[];
      preview_enabled?: boolean;
    }
  ): Promise<void> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (pkg.owner_id !== ownerId && !isAdmin) {
      throw new Error('FORBIDDEN: Sie sind nicht berechtigt, dieses Paket zu verwalten.');
    }

    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      const t = decodeEntities(String(patch.title).trim());
      if (t.length < 3 || t.length > 200) throw new Error('BAD_REQUEST: Der Titel muss 3 bis 200 Zeichen lang sein.');
      update.title = t;
    }
    if (patch.summary !== undefined) {
      const s = decodeEntities(String(patch.summary).trim());
      if (s.length < 1) throw new Error('BAD_REQUEST: Die Beschreibung darf nicht leer sein.');
      update.summary = s;
    }
    if (patch.license !== undefined) {
      if (!['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0'].includes(patch.license)) {
        throw new Error(`BAD_REQUEST: Unbekannte Lizenz '${patch.license}'.`);
      }
      update.license = patch.license;
    }
    if (patch.preview_enabled !== undefined) update.preview_enabled = !!patch.preview_enabled;
    if (patch.topic !== undefined) update.topic = patch.topic ? String(patch.topic).trim() : null;
    if (patch.canton !== undefined) update.canton = patch.canton ? String(patch.canton).toUpperCase() : null;
    if (patch.subject !== undefined) update.subject = patch.subject;
    if (patch.subject_category !== undefined) update.subject_category = patch.subject_category;

    const check = this.taxonomy.validateTaxonomy({
      subject: (update.subject as string) || pkg.subject,
      level: (update.subject_category as string) || pkg.subject_category,
      grades: patch.grades,
      canton: (update.canton as string) || undefined,
    });
    if (!check.valid) {
      throw new Error(`BAD_REQUEST: Taxonomie-Validierung fehlgeschlagen: ${check.errors.join('; ')}`);
    }

    await knex.transaction(async trx => {
      if (Object.keys(update).length > 0) {
        await trx('packages').where({ id: packageId }).update({ ...update, updated_at: new Date() });
      }
      if (patch.grades) {
        await trx('package_grades').where({ package_id: packageId }).del();
        for (const g of [...new Set(patch.grades)]) {
          await trx('package_grades').insert({ package_id: packageId, grade: g });
        }
      }
      if (patch.tags) {
        await trx('package_tags').where({ package_id: packageId }).del();
        for (const t of [...new Set(patch.tags.map(x => String(x).trim()).filter(Boolean))]) {
          await trx('package_tags').insert({ package_id: packageId, tag: t.slice(0, 50) });
        }
      }
    });
  }

  /** Packages owned by a user (for the "my packages" view in the plugin and dashboard). */
  public async listOwnedPackages(ownerId: string): Promise<Array<{
    id: string; title: string; summary: string; license: string; canton: string | null;
    subject: string; subject_category: string; grades: string[]; tags: string[];
    latest_version: string; versions: string[];
    preview_enabled: boolean; downloads_count: number; updated_at: string;
  }>> {
    const knex = getDatabase();
    const rows = await knex('packages').where({ owner_id: ownerId }).orderBy('updated_at', 'desc');
    const ids = rows.map(r => r.id);
    const releases = ids.length
      ? await knex('releases').whereIn('package_id', ids).where({ is_yanked: false })
      : [];
    const grades = ids.length ? await knex('package_grades').whereIn('package_id', ids) : [];
    const tags = ids.length ? await knex('package_tags').whereIn('package_id', ids) : [];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      license: r.license,
      canton: r.canton || null,
      subject: r.subject,
      subject_category: r.subject_category,
      grades: grades.filter(g => g.package_id === r.id).map(g => g.grade),
      tags: tags.filter(t => t.package_id === r.id).map(t => t.tag),
      latest_version: r.latest_version,
      versions: releases.filter(x => x.package_id === r.id).map(x => x.version),
      preview_enabled: !!r.preview_enabled,
      downloads_count: r.downloads_count,
      updated_at: new Date(r.updated_at).toISOString(),
    }));
  }

  /**
   * Withdraws one release. The row stays (yanked) so the version number can never be reused;
   * the file is removed from download/listing. latest_version moves to the highest remaining one.
   */
  public async withdrawRelease(ownerId: string, isAdmin: boolean, packageId: string, version: string): Promise<void> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (pkg.owner_id !== ownerId && !isAdmin) {
      throw new Error('FORBIDDEN: Sie sind nicht berechtigt, dieses Paket zu verwalten.');
    }
    const release = await knex('releases').where({ package_id: packageId, version, is_yanked: false }).first();
    if (!release) throw new Error('NOT_FOUND: Version nicht gefunden.');

    const remaining = (await knex('releases').where({ package_id: packageId, is_yanked: false }))
      .filter(r => r.version !== version)
      .map(r => r.version)
      .sort(semver.rcompare);
    if (remaining.length === 0) {
      throw new Error('CONFLICT: Dies ist die letzte Version. Ziehen Sie stattdessen das ganze Paket zurück.');
    }
    await knex.transaction(async trx => {
      await trx('releases').where({ id: release.id }).update({ is_yanked: true });
      await trx('packages').where({ id: packageId }).update({ latest_version: remaining[0], updated_at: new Date() });
    });
    await this.storage.removeRelease(packageId, version);
  }

  /** Withdraws a whole package: all releases, grades, tags and stored files are deleted. */
  public async withdrawPackage(ownerId: string, isAdmin: boolean, packageId: string): Promise<void> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (pkg.owner_id !== ownerId && !isAdmin) {
      throw new Error('FORBIDDEN: Sie sind nicht berechtigt, dieses Paket zu verwalten.');
    }
    await knex.transaction(async trx => {
      await trx('package_grades').where({ package_id: packageId }).del();
      await trx('package_tags').where({ package_id: packageId }).del();
      await trx('releases').where({ package_id: packageId }).del();
      await trx('packages').where({ id: packageId }).del();
    });
    await this.storage.removePackage(packageId);
  }

  public async incrementDownloadCount(packageId: string): Promise<void> {
    const knex = getDatabase();
    await knex('packages').where({ id: packageId }).increment('downloads_count', 1);
  }
}
