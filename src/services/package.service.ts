import crypto from 'crypto';
import fs from 'fs';
import semver from 'semver';
import { PackageMembersService, PackageRole } from './package-members.service';
import { getDatabase } from '../database/connection';
import { AdminService } from './admin.service';
import { SafeXmlValidatorService } from './xml-validator.service';
import { PackageStorageService } from './package-storage.service';
import { TaxonomyService } from './taxonomy.service';
import { GitHubService } from './github.service';
import { canonicalizeCategoryPaths } from './question-xml.service';
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
  /** '1'/'true': also list variants (forks) as catalog entries. */
  include_variants?: string | boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Outcome of committing a release to the linked GitHub repository; null when none is linked. */
export type GitHubSyncResult =
  | { status: 'ok'; commit_url: string; warning: string | null; repo_created?: boolean }
  | { status: 'error'; message: string }
  | null;

/**
 * Licences a fork may use, given the original's licence: CC BY-SA requires the same licence (share-alike),
 * CC BY allows CC BY or CC BY-SA (attribution stays), CC0 allows any.
 */
export function compatibleForkLicenses(original: string): string[] {
  if (original === 'CC-BY-SA-4.0') return ['CC-BY-SA-4.0'];
  if (original === 'CC-BY-4.0') return ['CC-BY-4.0', 'CC-BY-SA-4.0'];
  return ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0'];
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
    rawXml: string,
    /**
     * asPackageAdmin: set by callers that already checked package-admin rights (merging as a Hub admin).
     * fork: lineage of a new package created by ForkService, stored in the same insert.
     */
    opts: { asPackageAdmin?: boolean; fork?: { id: string; version: string; license: string } } = {}
  ): Promise<{
    package_id: string;
    version: string;
    sha256: string;
    file_size_bytes: number;
    question_count: number;
    qtypes_breakdown: Record<string, number>;
    download_url: string;
    created_at: string;
    github: GitHubSyncResult;
  }> {
    const knex = getDatabase();

    // Releases from Moodle 4.5 and 5.0 use different context prefixes; older plugins do not normalize them.
    rawXml = canonicalizeCategoryPaths(rawXml);

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
    let publisherRole: PackageRole | null = null;
    const tombstone = existingPackage ? null : await this.getWithdrawnPackage(manifest.id);
    if (tombstone) {
      if (tombstone.owner_id !== ownerId) {
        throw new Error('CONFLICT: Diese Paket-ID wurde zurückgezogen und kann nicht neu vergeben werden.');
      }
      // Moodles that imported an earlier release must never receive different content under its number.
      if (!semver.gt(manifest.version, tombstone.last_version)) {
        throw new Error(
          `CONFLICT: Dieses Paket wurde zurückgezogen. Eine neue Veröffentlichung braucht eine höhere Version als ${tombstone.last_version}.`
        );
      }
    }
    if (existingPackage) {
      const sameVersion = await knex('releases')
        .where({ package_id: manifest.id, version: manifest.version })
        .first();
      if (sameVersion) {
        throw new Error(
          `CONFLICT: Version ${manifest.version} existiert bereits oder ist nicht höher als die aktuelle Version ${existingPackage.latest_version} (zurückgezogene Versionen bleiben gesperrt).`
        );
      }
      publisherRole = opts.asPackageAdmin ? 'admin' : await PackageMembersService.getInstance().getRole(manifest.id, ownerId);
      if (!PackageMembersService.atLeast(publisherRole, 'editor')) {
        throw new Error('FORBIDDEN: Sie sind nicht berechtigt, neue Versionen dieses Pakets zu veröffentlichen.');
      }

      // Monotonic SemVer check
      if (!semver.gt(manifest.version, existingPackage.latest_version)) {
        throw new Error(
          `CONFLICT: Version ${manifest.version} existiert bereits oder ist nicht höher als die aktuelle Version ${existingPackage.latest_version}.`
        );
      }

      // A client that states its base version must have pulled the latest release first,
      // otherwise its update would silently drop changes published from elsewhere.
      if (manifest.base_version && manifest.base_version !== existingPackage.latest_version) {
        throw new Error(
          `CONFLICT: Ihre Inhalte beruhen auf Version ${manifest.base_version}, im Hub ist bereits Version ${existingPackage.latest_version}. Holen Sie zuerst die neue Version und veröffentlichen Sie danach.`
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

    // Optional GitHub link: only package admins set it (editors' manifests keep the package settings).
    // undefined keeps the current link, '' or null removes it.
    const mayLinkGitHub = !existingPackage || publisherRole === 'admin';
    const githubLink = mayLinkGitHub && manifest.github_repo !== undefined
      ? await this.resolveGitHubLink(ownerId, manifest.github_repo)
      : undefined;

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

    try {
    await knex.transaction(async trx => {
      if (tombstone) {
        await trx('withdrawn_packages').where({ id: manifest.id }).del();
      }
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
          visibility: manifest.visibility === 'private' ? 'private' : 'public',
          github_repo: githubLink?.github_repo ?? null,
          github_linked_by: githubLink?.github_linked_by ?? null,
          ...(opts.fork ? { forked_from_id: opts.fork.id, forked_from_version: opts.fork.version, forked_from_license: opts.fork.license } : {}),
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
      } else if (publisherRole !== 'admin') {
        // Editors add versions; the package settings stay with its admins.
        const moved = await trx('packages').where({ id: manifest.id, latest_version: existingPackage.latest_version })
          .update({ latest_version: manifest.version, updated_at: now });
        if (moved !== 1) throw new Error('CONFLICT: Inzwischen wurde eine andere Version veröffentlicht. Bitte erneut versuchen.');
      } else {
        const moved = await trx('packages')
          .where({ id: manifest.id, latest_version: existingPackage.latest_version })
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
            visibility:
              manifest.visibility === undefined
                ? existingPackage.visibility || 'public'
                : manifest.visibility === 'private' ? 'private' : 'public',
            ...(githubLink ? { github_repo: githubLink.github_repo, github_linked_by: githubLink.github_linked_by } : {}),
            updated_at: now,
          });
        // Another publish (e.g. a parallel merge) since the checks above: its changes must not be overwritten.
        if (moved !== 1) throw new Error('CONFLICT: Inzwischen wurde eine andere Version veröffentlicht. Bitte erneut versuchen.');
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
    } catch (err) {
      // Nothing was recorded: drop the stored file again, so the version number stays free for a retry
      // (unless a parallel publish of the same number recorded it).
      const recorded = await knex('releases').where({ package_id: manifest.id, version: manifest.version }).first('id').catch(() => true);
      if (!recorded) await this.storage.removeRelease(manifest.id, manifest.version).catch(() => {});
      throw err;
    }

    const synced = await this.syncReleaseToGitHub(manifest.id, manifest.version, rawXml, manifest.release_notes);
    const github = synced?.status === 'ok' && githubLink?.repoCreated ? { ...synced, repo_created: true } : synced;

    return {
      package_id: manifest.id,
      version: manifest.version,
      sha256: staged.sha256,
      file_size_bytes: staged.sizeBytes,
      question_count: report.stats.question_count,
      qtypes_breakdown: report.stats.qtypes_breakdown,
      download_url: `/api/v1/packages/${manifest.id}/releases/${manifest.version}/download`,
      created_at: now.toISOString(),
      github,
    };
  }

  /**
   * Columns for a GitHub link set by `userId`: null values unlink. Throws BAD_REQUEST for an invalid URL
   * or when the user's GitHub token cannot write to the repository.
   */
  private async resolveGitHubLink(
    userId: string,
    input: string | null
  ): Promise<{ github_repo: string | null; github_linked_by: string | null; repoCreated: boolean }> {
    if (input === null || String(input).trim() === '') return { github_repo: null, github_linked_by: null, repoCreated: false };
    const ref = GitHubService.parseRepoUrl(String(input));
    if (!ref) {
      throw new Error('BAD_REQUEST: Ungültige GitHub-Adresse. Erwartet wird z.B. git@github.com:konto/repository.git.');
    }
    const { created } = await GitHubService.getInstance().ensureRepo(userId, ref);
    return { github_repo: GitHubService.canonicalUrl(ref), github_linked_by: userId, repoCreated: created };
  }

  /**
   * Commits a just published release to the package's GitHub repository, if one is linked. The release is
   * already stored, so a failure never undoes the publish: it is recorded on the release and returned.
   */
  private async syncReleaseToGitHub(
    packageId: string,
    version: string,
    rawXml: string,
    releaseNotes?: string
  ): Promise<GitHubSyncResult> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first('github_repo', 'github_linked_by');
    if (!pkg?.github_repo) return null;
    try {
      const pushed = await GitHubService.getInstance().pushRelease({
        userId: pkg.github_linked_by,
        repoUrl: pkg.github_repo,
        packageId,
        version,
        xml: rawXml,
        message: releaseNotes?.trim() || `Version ${version}`,
      });
      await knex('releases').where({ package_id: packageId, version })
        .update({ github_commit_url: pushed.commit_url, github_error: pushed.warning });
      return { status: 'ok', ...pushed };
    } catch (err: any) {
      const message = String(err?.message || 'Unbekannter Fehler bei GitHub.');
      await knex('releases').where({ package_id: packageId, version }).update({ github_error: message });
      return { status: 'error', message };
    }
  }

  /**
   * Search packages with multifaceted filtering and pagination.
   */
  public async searchPackages(filters: PackageSearchFilters, viewerId?: string): Promise<{
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
    // Variants (forks) are shown inside their original unless asked for; once the original is withdrawn
    // they stand on their own again.
    const includeVariants = filters.include_variants === true || ['1', 'true'].includes(String(filters.include_variants));
    if (!includeVariants) {
      query = query.where(function () {
        this.whereNull('packages.forked_from_id')
          .orWhereNotExists(function () {
            this.select('*').from('packages as origin').whereRaw('origin.id = packages.forked_from_id');
          });
      });
    }

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
          .orWhereRaw("(packages.visibility != 'private' AND (LOWER(packages.summary) LIKE ? OR LOWER(packages.topic) LIKE ? OR LOWER(packages.id) LIKE ?))", [qLower, qLower, qLower])
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

    const accessRequests = viewerId && packageIds.length > 0
      ? await knex('package_access_requests').where({ requester_id: viewerId }).whereIn('package_id', packageIds)
      : [];
    const accessByPackage = new Map(accessRequests.map(request => [request.package_id, request.status]));
    const rolesByPackage = await PackageMembersService.getInstance().getRoles(packageIds, viewerId);
    const variantCounts = new Map<string, number>();
    for (const id of packageIds) variantCounts.set(id, await this.countVariants(id, viewerId));

    const data: PackageSearchResult[] = rows.map(row => {
      const pkgReleases = releases.filter(r => r.package_id === row.id);
      const pkgTags = tags.filter(t => t.package_id === row.id).map(t => t.tag);
      const pkgGrades = grades.filter(g => g.package_id === row.id).map(g => g.grade);

      const latestRelease = pkgReleases.find(r => r.version === row.latest_version) || pkgReleases[0];
      let categoriesCount = 0;
      let categoryPaths: string[] = [];
      let questionCount = 0;
      let qtypesBreakdown: Record<string, number> = {};

      if (latestRelease) {
        questionCount = latestRelease.question_count;
        try {
          const cats = JSON.parse(latestRelease.categories_json);
          categoriesCount = Array.isArray(cats) ? cats.length : 1;
          categoryPaths = Array.isArray(cats) ? cats : [];
        } catch {}
        try {
          qtypesBreakdown = JSON.parse(latestRelease.qtypes_json);
        } catch {}
      }

      const isPrivate = row.visibility === 'private';
      const accessStatus = accessByPackage.get(row.id) as 'pending' | 'approved' | 'denied' | undefined;
      const myRole = rolesByPackage.get(row.id) || null;
      const canAccess = !isPrivate || !!myRole;

      return {
        id: row.id,
        title: row.title,
        summary: canAccess ? row.summary : '',
        language: row.language,
        license: canAccess ? row.license : '',
        author: {
          id: canAccess ? row.owner_id : undefined,
          name: row.author_name,
          institution: row.author_institution,
          canton: row.author_canton,
        },
        taxonomy: {
          framework: row.framework,
          canton: row.canton || undefined,
          level: 'GYM_SEK_II',
          grades: canAccess ? pkgGrades : [],
          subject_category: row.subject_category,
          subject: row.subject,
          topic: canAccess ? row.topic || undefined : undefined,
          tags: canAccess ? pkgTags : [],
        },
        latest_version: canAccess ? row.latest_version : '',
        versions: canAccess ? pkgReleases.map(r => r.version) : [],
        preview_enabled: canAccess && !!row.preview_enabled,
        visibility: isPrivate ? 'private' : 'public',
        access_status: accessStatus,
        can_access: canAccess,
        my_role: myRole,
        forked_from_id: row.forked_from_id || null,
        variants_count: canAccess ? variantCounts.get(row.id) || 0 : 0,
        categories: canAccess ? categoryPaths : [],
        stats: {
          question_count: canAccess ? questionCount : 0,
          categories_count: canAccess ? categoriesCount : 0,
          downloads_count: canAccess ? row.downloads_count : 0,
          qtypes_breakdown: canAccess ? qtypesBreakdown : {},
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
  public async getPackage(packageId: string, viewerId?: string): Promise<PackageDetailResult | null> {
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

    const accessRequest = viewerId
      ? await knex('package_access_requests').where({ package_id: packageId, requester_id: viewerId }).first()
      : null;
    const accessStatus = accessRequest?.status as 'pending' | 'approved' | 'denied' | undefined;
    const isPrivate = row.visibility === 'private';
    const myRole = await PackageMembersService.getInstance().getRole(packageId, viewerId);
    const canAccess = !isPrivate || !!myRole;
    const isHubAdmin = !!viewerId && await AdminService.getInstance().isAdmin(viewerId);

    const releases = await knex('releases')
      .where({ package_id: packageId, is_yanked: false })
      .orderBy('created_at', 'desc');

    const tags = await knex('package_tags').where({ package_id: packageId });
    const grades = await knex('package_grades').where({ package_id: packageId });

    let forkedFrom: PackageDetailResult['forked_from'] = null;
    if (row.forked_from_id) {
      const originRow = await knex('packages').join('users', 'packages.owner_id', 'users.id')
        .where({ 'packages.id': row.forked_from_id }).first('packages.title', 'packages.visibility', 'users.full_name');
      // A private original's title and author stay hidden from people without access to it.
      const origin = originRow && (originRow.visibility !== 'private' || await this.canAccessPackage(row.forked_from_id, viewerId)) ? originRow : null;
      forkedFrom = {
        id: row.forked_from_id,
        version: row.forked_from_version || null,
        license: row.forked_from_license || null,
        title: origin ? origin.title : null,
        author_name: origin ? origin.full_name : null,
        exists: !!originRow,
      };
    }
    const forksCount = await this.countVariants(packageId, viewerId);
    const rootId = await this.rootOf(packageId);
    const openMrs = canAccess
      ? Number((await knex('merge_requests').where({ target_package_id: packageId }).whereIn('status', ['open', 'merging']).count<{ c: number }>('id as c').first())?.c || 0)
      : 0;

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

    const result: PackageDetailResult = {
      id: row.id,
      title: row.title,
      summary: canAccess ? row.summary : 'Privates Fragenpaket. Beantragen Sie Zugriff, um weitere Angaben zu sehen.',
      language: row.language,
      license: canAccess ? row.license : '',
      author: {
        id: canAccess ? row.owner_id : undefined,
        name: row.author_name,
        institution: row.author_institution,
        canton: row.author_canton,
      },
      taxonomy: {
        framework: row.framework,
        canton: row.canton || undefined,
        level: 'GYM_SEK_II',
        grades: canAccess ? grades.map(g => g.grade) : [],
        subject_category: row.subject_category,
        subject: row.subject,
        topic: canAccess ? row.topic || undefined : undefined,
        tags: canAccess ? tags.map(t => t.tag) : [],
      },
      latest_version: canAccess ? row.latest_version : '',
      versions: canAccess ? releases.map(r => r.version) : [],
      preview_enabled: canAccess && !!row.preview_enabled,
      visibility: isPrivate ? 'private' : 'public',
      access_status: accessStatus,
      can_access: canAccess,
      my_role: myRole,
      can_manage: myRole === 'admin' || isHubAdmin,
      github_repo: myRole === 'admin' || isHubAdmin ? row.github_repo || null : undefined,
      forked_from_id: row.forked_from_id || null,
      forked_from: forkedFrom,
      // The original at the top of a variant chain (itself for an original); the web page shows variants there.
      root_id: rootId,
      forks_count: forksCount,
      open_merge_requests_count: openMrs,
      stats: {
        question_count: canAccess && latestRelease ? latestRelease.question_count : 0,
        categories_count: canAccess ? categories.length : 0,
        downloads_count: canAccess ? row.downloads_count : 0,
        qtypes_breakdown: canAccess ? qtypesBreakdown : {},
      },
      categories: canAccess ? categories : [],
      releases: canAccess ? releases.map(r => ({
        version: r.version,
        sha256: r.sha256,
        file_size_bytes: Number(r.file_size_bytes),
        question_count: r.question_count,
        release_notes: r.release_notes || undefined,
        download_url: `/api/v1/packages/${packageId}/releases/${r.version}/download`,
        created_at: new Date(r.created_at).toISOString(),
        ...(myRole === 'admin' || isHubAdmin
          ? { github_commit_url: r.github_commit_url || null, github_error: r.github_error || null }
          : {}),
      })) : [],
      compatibility: {
        min_moodle_version: '4.5',
        tested_versions: ['4.5', '5.0'],
      },
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };

    return result;
  }

  /** Topmost existing original of a variant chain (the package itself when it is not a variant). */
  public async rootOf(packageId: string): Promise<string> {
    const knex = getDatabase();
    let current = packageId;
    for (let i = 0; i < 20; i++) {
      const row = await knex('packages').where({ id: current }).first('forked_from_id');
      if (!row?.forked_from_id || !(await knex('packages').where({ id: row.forked_from_id }).first('id'))) return current;
      current = row.forked_from_id;
    }
    return current;
  }

  /** Variants below a package (also variants of variants) the viewer may see. */
  public async countVariants(packageId: string, viewerId?: string): Promise<number> {
    const knex = getDatabase();
    let count = 0;
    let level = [packageId];
    const seen = new Set(level);
    for (let depth = 0; depth < 20 && level.length; depth++) {
      const children: string[] = await knex('packages').whereIn('forked_from_id', level).pluck('id');
      level = children.filter(c => !seen.has(c));
      for (const c of level) {
        seen.add(c);
        if (await this.canAccessPackage(c, viewerId)) count++;
      }
    }
    return count;
  }

  public async canAccessPackage(packageId: string, userId?: string): Promise<boolean> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).select('owner_id', 'visibility').first();
    if (!pkg) return false;
    if (pkg.visibility !== 'private') return true;
    return !!(await PackageMembersService.getInstance().getRole(packageId, userId));
  }

  public async createAccessRequest(
    packageId: string,
    requesterId: string,
    note: { message: string | null; shareContact: boolean } = { message: null, shareContact: true },
  ): Promise<{
    shouldNotifyOwner: boolean;
    requestStatus: string;
    packageTitle: string;
    requester: { name: string; email: string; institution: string };
    adminEmails: string[];
  }> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (pkg.visibility !== 'private') throw new Error('CONFLICT: Dieses Paket ist bereits öffentlich.');
    if (await PackageMembersService.getInstance().getRole(packageId, requesterId)) {
      throw new Error('CONFLICT: Sie haben bereits Zugriff auf dieses Paket.');
    }

    const [admins, requester] = await Promise.all([
      knex('users').where({ id: pkg.owner_id })
        .orWhereIn('id', knex('package_members').where({ package_id: packageId, role: 'admin' }).select('user_id'))
        .pluck('email'),
      knex('users').where({ id: requesterId }).select('full_name', 'email', 'institution').first(),
    ]);
    if (admins.length === 0 || !requester) throw new Error('NOT_FOUND: Benutzerkonto nicht gefunden.');

    const existing = await knex('package_access_requests').where({ package_id: packageId, requester_id: requesterId }).first();
    let shouldNotifyOwner = false;
    if (!existing) {
      const now = new Date();
      await knex('package_access_requests').insert({
        id: crypto.randomUUID(), package_id: packageId, requester_id: requesterId,
        status: 'pending', message: note.message, share_contact: note.shareContact, created_at: now, updated_at: now,
      });
      shouldNotifyOwner = true;
    } else if (existing.status === 'denied') {
      await knex('package_access_requests').where({ id: existing.id }).update({
        status: 'pending', message: note.message, share_contact: note.shareContact, response_message: null, updated_at: new Date(),
      });
      shouldNotifyOwner = true;
    }

    return {
      shouldNotifyOwner,
      requestStatus: existing?.status === 'approved' ? 'approved' : 'pending',
      packageTitle: pkg.title,
      requester: { name: requester.full_name, email: requester.email, institution: requester.institution },
      adminEmails: admins,
    };
  }

  public async listAccessRequests(ownerId: string, packageId: string): Promise<any[]> {
    const knex = getDatabase();
    await PackageMembersService.getInstance().require(packageId, ownerId, 'admin', 'Nur Admins des Pakets sehen die Zugriffsanfragen.');

    const rows = await knex('package_access_requests')
      .join('users', 'package_access_requests.requester_id', 'users.id')
      .where({ 'package_access_requests.package_id': packageId })
      .select(
        'package_access_requests.id', 'package_access_requests.status', 'package_access_requests.created_at',
        'package_access_requests.updated_at', 'package_access_requests.message', 'package_access_requests.share_contact',
        'package_access_requests.response_message', 'users.id as requester_id', 'users.full_name as requester_name', 'users.email as requester_email',
        'users.institution as requester_institution'
      )
      .orderBy('package_access_requests.created_at', 'desc');

    // Contact details are only shown when the requester agreed to share them.
    return rows.map(row => ({
      id: row.id,
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      message: row.message || null,
      response_message: row.response_message || null,
      share_contact: !!row.share_contact,
      requester: {
        id: row.requester_id,
        name: row.requester_name,
        email: row.share_contact ? row.requester_email : null,
        institution: row.share_contact ? row.requester_institution : null,
      },
    }));
  }

  /** Stores the decision with the owner's optional reply and returns what the notification to the requester needs. */
  public async setAccessRequestStatus(
    ownerId: string, packageId: string, requestId: string, status: 'approved' | 'denied', responseMessage: string | null = null,
  ): Promise<{ packageTitle: string; requesterEmail: string; requesterName: string; ownerName: string }> {
    const knex = getDatabase();
    const row = await knex('package_access_requests')
      .join('packages', 'package_access_requests.package_id', 'packages.id')
      .join('users as requester', 'package_access_requests.requester_id', 'requester.id')
      .where({ 'package_access_requests.id': requestId, 'package_access_requests.package_id': packageId })
      .select('package_access_requests.id', 'package_access_requests.requester_id', 'packages.title',
        'requester.email as requester_email', 'requester.full_name as requester_name')
      .first();
    if (!row) throw new Error('NOT_FOUND: Zugriffsanfrage nicht gefunden.');
    await PackageMembersService.getInstance().require(packageId, ownerId, 'admin', 'Nur Admins des Pakets können Anfragen bearbeiten.');
    const decider = await knex('users').where({ id: ownerId }).first('full_name');

    const now = new Date();
    await knex.transaction(async trx => {
      await trx('package_access_requests').where({ id: requestId })
        .update({ status, response_message: responseMessage, updated_at: now });
      const member = await trx('package_members').where({ package_id: packageId, user_id: row.requester_id }).first();
      // Approval grants read access (membership); a refusal only removes plain read access, never a higher role.
      if (status === 'approved' && !member) {
        await trx('package_members').insert({ package_id: packageId, user_id: row.requester_id, role: 'member', created_at: now, updated_at: now });
      } else if (status === 'denied' && member?.role === 'member') {
        await trx('package_members').where({ package_id: packageId, user_id: row.requester_id }).del();
      }
    });
    return { packageTitle: row.title, requesterEmail: row.requester_email, requesterName: row.requester_name, ownerName: decider?.full_name || '' };
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
      visibility?: 'public' | 'private';
      github_repo?: string | null;
    }
  ): Promise<{ github: GitHubSyncResult }> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    await PackageMembersService.getInstance().require(packageId, ownerId, 'admin', 'Sie sind nicht berechtigt, dieses Paket zu verwalten.');

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
      if (pkg.forked_from_license && !compatibleForkLicenses(pkg.forked_from_license).includes(patch.license)) {
        throw new Error(`BAD_REQUEST: Diese Variante stammt aus einem Paket unter ${pkg.forked_from_license}; erlaubt sind nur ${compatibleForkLicenses(pkg.forked_from_license).join(', ')}.`);
      }
      update.license = patch.license;
    }
    if (patch.preview_enabled !== undefined) update.preview_enabled = !!patch.preview_enabled;
    if (patch.visibility !== undefined) {
      if (patch.visibility !== 'public' && patch.visibility !== 'private') {
        throw new Error('BAD_REQUEST: Die Sichtbarkeit muss public oder private sein.');
      }
      update.visibility = patch.visibility;
    }
    if (patch.topic !== undefined) update.topic = patch.topic ? String(patch.topic).trim() : null;
    if (patch.canton !== undefined) update.canton = patch.canton ? String(patch.canton).toUpperCase() : null;
    if (patch.subject !== undefined) update.subject = patch.subject;
    if (patch.subject_category !== undefined) update.subject_category = patch.subject_category;
    let linkedNewRepo = false;
    let repoCreated = false;
    if (patch.github_repo !== undefined) {
      const link = await this.resolveGitHubLink(ownerId, patch.github_repo);
      // Saving the unchanged repository keeps whose token pushes.
      if (link.github_repo !== pkg.github_repo || !link.github_repo) {
        Object.assign(update, { github_repo: link.github_repo, github_linked_by: link.github_linked_by });
      }
      linkedNewRepo = !!link.github_repo && link.github_repo !== pkg.github_repo;
      repoCreated = link.repoCreated;
    }

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

    // A newly linked repository starts with the current version instead of waiting for the next one.
    if (!linkedNewRepo) return { github: null };
    const latest = await knex('releases').where({ package_id: packageId, version: pkg.latest_version, is_yanked: false }).first();
    if (!latest) return { github: null };
    let xml: string;
    try {
      xml = await fs.promises.readFile(this.storage.getReleaseFilePath(packageId, latest.version), 'utf-8');
    } catch {
      return { github: { status: 'error', message: `Die Datei der Version ${latest.version} ist nicht lesbar.` } };
    }
    const synced = await this.syncReleaseToGitHub(packageId, latest.version, xml, latest.release_notes || undefined);
    return { github: synced?.status === 'ok' && repoCreated ? { ...synced, repo_created: true } : synced };
  }

  /**
   * Packages a user may publish to: created by them or shared with them as editor or admin
   * (the "my packages" view in the plugin and dashboard). `my_role` says what else they may do.
   */
  public async listOwnedPackages(ownerId: string): Promise<Array<{
    id: string; title: string; summary: string; license: string; canton: string | null;
    subject: string; subject_category: string; grades: string[]; tags: string[];
    latest_version: string; versions: string[];
    preview_enabled: boolean; downloads_count: number; updated_at: string; my_role: PackageRole; is_creator: boolean;
    github_repo: string | null; github_linked: boolean;
    forked_from_id: string | null; forked_from_version: string | null;
    forked_from: { id: string; version: string | null; license: string | null } | null;
  }>> {
    const knex = getDatabase();
    const rows = await knex('packages')
      .where({ owner_id: ownerId })
      .orWhereIn('id', knex('package_members').where({ user_id: ownerId }).whereIn('role', ['editor', 'admin']).select('package_id'))
      .orderBy('updated_at', 'desc');
    const roles = await PackageMembersService.getInstance().getRoles(rows.map(r => r.id), ownerId);
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
      visibility: r.visibility === 'private' ? 'private' : 'public',
      downloads_count: r.downloads_count,
      updated_at: new Date(r.updated_at).toISOString(),
      my_role: roles.get(r.id) || 'editor',
      is_creator: r.owner_id === ownerId,
      github_repo: roles.get(r.id) === 'admin' ? r.github_repo || null : null,
      // Editors only learn that new versions also go to GitHub, not where.
      github_linked: !!r.github_repo,
      forked_from_id: r.forked_from_id || null,
      forked_from_version: r.forked_from_version || null,
      forked_from: r.forked_from_id ? { id: r.forked_from_id, version: r.forked_from_version || null, license: r.forked_from_license || null } : null,
    }));
  }

  /**
   * Withdraws one release. The row stays (yanked) so the version number can never be reused;
   * the file is removed from download/listing. latest_version moves to the highest remaining one.
   */
  public async withdrawRelease(ownerId: string, packageId: string, version: string): Promise<void> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    await PackageMembersService.getInstance().require(packageId, ownerId, 'admin', 'Sie sind nicht berechtigt, dieses Paket zu verwalten.');
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

  /** Tombstone of a withdrawn package, or undefined. */
  public async getWithdrawnPackage(
    packageId: string
  ): Promise<{ id: string; owner_id: string; last_version: string; withdrawn_at: Date } | undefined> {
    return getDatabase()('withdrawn_packages').where({ id: packageId }).first();
  }

  /**
   * Withdraws a whole package: all releases, grades, tags and stored files are deleted.
   * A tombstone keeps the ID reserved so clients can tell "withdrawn" (410) from "unknown" (404).
   */
  public async withdrawPackage(ownerId: string, packageId: string): Promise<void> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    await PackageMembersService.getInstance().require(packageId, ownerId, 'admin', 'Sie sind nicht berechtigt, dieses Paket zu verwalten.');
    const versions = (await knex('releases').where({ package_id: packageId }).pluck('version'))
      .filter((v: string) => semver.valid(v))
      .sort(semver.rcompare);
    const lastVersion = versions[0] || pkg.latest_version;
    await knex.transaction(async trx => {
      await trx('withdrawn_packages').where({ id: packageId }).del();
      await trx('withdrawn_packages').insert({
        id: packageId, owner_id: pkg.owner_id, last_version: lastVersion, withdrawn_at: new Date(),
      });
      await trx('package_grades').where({ package_id: packageId }).del();
      await trx('package_tags').where({ package_id: packageId }).del();
      await trx('package_members').where({ package_id: packageId }).del();
      // Merge requests into the package go with it; open ones from it (a fork) are closed with a note.
      await trx('merge_requests').where({ target_package_id: packageId }).del();
      const openFromHere = await trx('merge_requests').where({ source_package_id: packageId }).whereIn('status', ['open', 'merging']).pluck('id');
      for (const mrId of openFromHere) {
        await trx('merge_requests').where({ id: mrId }).update({ status: 'closed', closed_by: ownerId, closed_at: new Date(), updated_at: new Date() });
        await trx('merge_request_notes').insert({
          id: crypto.randomUUID(), merge_request_id: mrId, author_id: ownerId, kind: 'system',
          body: 'hat den Änderungsvorschlag geschlossen: Die Variante wurde zurückgezogen.', created_at: new Date(), updated_at: new Date(),
        });
      }
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
