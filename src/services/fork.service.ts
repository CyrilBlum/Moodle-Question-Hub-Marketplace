import fs from 'fs';
import semver from 'semver';
import { getDatabase } from '../database/connection';
import { PackageService, compatibleForkLicenses } from './package.service';
import { PackageMembersService } from './package-members.service';
import { PackageStorageService } from './package-storage.service';
import { PackageManifest } from '../types/package.types';
import {
  ParsedPackage, MergeEntry, Resolution, parsePackage, compareThreeWay, mergeThreeWay, sameContent, questionDiff,
} from './question-xml.service';

/** Package IDs a fork may get: lowercase letters, digits, dot, dash, underscore; 3–100 characters. */
const PACKAGE_ID_RE = /^[a-z0-9][a-z0-9._-]{1,98}[a-z0-9]$/;

export interface ChangeView {
  key: string;
  name: string;
  type: string;
  category: string;
  status: 'added' | 'removed' | 'modified';
  conflict: boolean;
  /** What the other side changed, for conflicts. */
  other_status: 'added' | 'removed' | 'modified' | null;
  hunks: ReturnType<typeof questionDiff>;
  /** For conflicts: the other side's change relative to the base. */
  other_hunks?: ReturnType<typeof questionDiff>;
}

/** Shared helpers for forks and merge requests: release contents and comparisons. */
export class PackageContent {
  /** Parsed release, or null when the release (or its file) no longer exists. */
  public static async read(packageId: string, version: string | null | undefined): Promise<{ xml: string; parsed: ParsedPackage } | null> {
    if (!version) return null;
    const release = await getDatabase()('releases').where({ package_id: packageId, version, is_yanked: false }).first('id');
    if (!release) return null;
    try {
      const xml = await fs.promises.readFile(PackageStorageService.getInstance().getReleaseFilePath(packageId, version), 'utf-8');
      return { xml, parsed: parsePackage(xml) };
    } catch {
      return null;
    }
  }

  /** Manifest that publishes a new version of an existing package with its current settings. */
  public static async manifestFor(packageId: string, version: string, releaseNotes: string, baseVersion?: string): Promise<PackageManifest> {
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first();
    if (!pkg) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    const grades: string[] = await knex('package_grades').where({ package_id: packageId }).pluck('grade');
    const tags: string[] = await knex('package_tags').where({ package_id: packageId }).pluck('tag');
    return {
      id: packageId,
      version,
      title: pkg.title,
      summary: pkg.summary,
      language: pkg.language,
      license: pkg.license,
      taxonomy: {
        framework: pkg.framework,
        subject: pkg.subject,
        subject_category: pkg.subject_category,
        topic: pkg.topic || undefined,
        canton: pkg.canton || undefined,
        grades,
        tags,
      },
      preview_enabled: !!pkg.preview_enabled,
      visibility: pkg.visibility === 'private' ? 'private' : 'public',
      release_notes: releaseNotes,
      ...(baseVersion ? { base_version: baseVersion } : {}),
    };
  }

  /** One side's changes against the base, for display; conflicts carry the other side's change too. */
  public static changeViews(entries: MergeEntry[], side: 'source' | 'target'): ChangeView[] {
    const other = side === 'source' ? 'target' : 'source';
    return entries
      .filter(e => e[`${side}_status`])
      .map(e => ({
        key: e.key,
        name: e.name,
        type: e.type,
        category: e.category,
        status: e[`${side}_status`]!,
        conflict: e.conflict,
        other_status: e[`${other}_status`],
        hunks: questionDiff(e.base, e[side]),
        ...(e.conflict ? { other_hunks: questionDiff(e.base, e[other]) } : {}),
      }));
  }

  /** Next patch version above every version the package ever had (withdrawn ones stay blocked). */
  public static async nextVersion(packageId: string): Promise<string> {
    const versions: string[] = (await getDatabase()('releases').where({ package_id: packageId }).pluck('version'))
      .filter((v: string) => semver.valid(v));
    const top = versions.sort(semver.rcompare)[0] || '1.0.0';
    return semver.inc(top, 'patch') || '1.0.1';
  }
}

export class ForkService {
  private static instance: ForkService | null = null;

  public static getInstance(): ForkService {
    if (!ForkService.instance) ForkService.instance = new ForkService();
    return ForkService.instance;
  }

  /**
   * Copies a release of a package into a new package owned by the user. The fork starts with the same
   * version number, inherits licence and settings and remembers the original and its version (the base of
   * later syncs and merge requests). A fork of a private package stays private.
   */
  public async forkPackage(
    userId: string,
    sourceId: string,
    options: { id?: string; title?: string; version?: string; visibility?: string; license?: string },
  ): Promise<{ package_id: string; version: string; forked_from_id: string; forked_from_version: string }> {
    const knex = getDatabase();
    const packages = PackageService.getInstance();
    const source = await knex('packages').where({ id: sourceId }).first();
    if (!source || !(await packages.canAccessPackage(sourceId, userId))) {
      throw new Error('NOT_FOUND: Paket nicht gefunden.');
    }
    const version = options.version || source.latest_version;
    const content = await PackageContent.read(sourceId, version);
    if (!content) throw new Error(`NOT_FOUND: Version ${version} von '${sourceId}' nicht gefunden.`);

    const forkId = options.id ? String(options.id).trim().toLowerCase() : await this.suggestId(sourceId, userId);
    if (!PACKAGE_ID_RE.test(forkId)) {
      throw new Error('BAD_REQUEST: Die Paket-ID darf nur Kleinbuchstaben, Ziffern, Punkt, Binde- und Unterstrich enthalten (3 bis 100 Zeichen).');
    }
    if (await knex('packages').where({ id: forkId }).first('id') || await packages.getWithdrawnPackage(forkId)) {
      throw new Error(`CONFLICT: Die Paket-ID '${forkId}' ist bereits vergeben.`);
    }
    const license = options.license || source.license;
    if (!compatibleForkLicenses(source.license).includes(license)) {
      throw new Error(`BAD_REQUEST: Ein Fork eines Pakets unter ${source.license} kann nur unter ${compatibleForkLicenses(source.license).join(', ')} stehen.`);
    }
    const title = (options.title ? String(options.title).trim() : `${source.title} (Fork)`).slice(0, 200);
    if (title.length < 3) throw new Error('BAD_REQUEST: Der Titel muss mindestens 3 Zeichen lang sein.');

    const manifest = await PackageContent.manifestFor(sourceId, version, `Fork von ${sourceId} v${version}`);
    manifest.id = forkId;
    manifest.title = title;
    manifest.license = license;
    manifest.visibility = source.visibility === 'private' ? 'private' : options.visibility === 'private' ? 'private' : 'public';
    await packages.publishPackage(userId, manifest, content.xml);
    await knex('packages').where({ id: forkId }).update({
      forked_from_id: sourceId, forked_from_version: version, forked_from_license: source.license,
    });
    return { package_id: forkId, version, forked_from_id: sourceId, forked_from_version: version };
  }

  /** A free ID like "<original>-fork", "<original>-fork-2", … */
  public async suggestId(sourceId: string, _userId?: string): Promise<string> {
    const knex = getDatabase();
    const stem = `${sourceId.slice(0, 90)}-fork`;
    for (let n = 1; n < 1000; n++) {
      const candidate = n === 1 ? stem : `${stem}-${n}`;
      const taken = await knex('packages').where({ id: candidate }).first('id')
        || await knex('withdrawn_packages').where({ id: candidate }).first('id');
      if (!taken) return candidate;
    }
    throw new Error('CONFLICT: Keine freie Paket-ID gefunden. Geben Sie eine ID an.');
  }

  /** Forks of a package the viewer may see. */
  public async listForks(packageId: string, viewerId?: string): Promise<any[]> {
    const knex = getDatabase();
    const packages = PackageService.getInstance();
    if (!(await knex('packages').where({ id: packageId }).first('id'))) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (!(await packages.canAccessPackage(packageId, viewerId))) throw new Error('FORBIDDEN: Kein Zugriff auf dieses Paket.');
    const rows = await knex('packages').join('users', 'packages.owner_id', 'users.id')
      .where({ 'packages.forked_from_id': packageId })
      .select('packages.id', 'packages.title', 'packages.latest_version', 'packages.forked_from_version',
        'packages.visibility', 'packages.updated_at', 'packages.created_at', 'users.full_name as author_name', 'users.institution')
      .orderBy('packages.updated_at', 'desc');
    const visible = [];
    for (const r of rows) {
      if (!(await packages.canAccessPackage(r.id, viewerId))) continue;
      const openMr = await knex('merge_requests').where({ source_package_id: r.id, target_package_id: packageId, status: 'open' }).first('number');
      visible.push({
        id: r.id, title: r.title, latest_version: r.latest_version, forked_from_version: r.forked_from_version,
        visibility: r.visibility === 'private' ? 'private' : 'public',
        author: { name: r.author_name, institution: r.institution },
        open_merge_request: openMr ? openMr.number : null,
        created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString(),
      });
    }
    return visible;
  }

  /** Base, fork and original contents of a fork; throws when the original is gone or not accessible. */
  private async contents(forkId: string, viewerId?: string) {
    const knex = getDatabase();
    const fork = await knex('packages').where({ id: forkId }).first();
    if (!fork) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (!fork.forked_from_id) throw new Error('BAD_REQUEST: Dieses Paket ist kein Fork.');
    const upstream = await knex('packages').where({ id: fork.forked_from_id }).first();
    if (!upstream) throw new Error('CONFLICT: Das ursprüngliche Paket wurde zurückgezogen.');
    if (!(await PackageService.getInstance().canAccessPackage(upstream.id, viewerId))) {
      throw new Error('FORBIDDEN: Sie haben keinen Zugriff mehr auf das ursprüngliche Paket.');
    }
    const [forkContent, upstreamContent, baseContent] = await Promise.all([
      PackageContent.read(forkId, fork.latest_version),
      PackageContent.read(upstream.id, upstream.latest_version),
      PackageContent.read(upstream.id, fork.forked_from_version),
    ]);
    if (!forkContent || !upstreamContent) throw new Error('NOT_FOUND: Eine Paketdatei ist nicht lesbar.');
    // A withdrawn base version: compare with the original's current version instead (fork changes win).
    const base = baseContent ?? upstreamContent;
    return { fork, upstream, forkContent, upstreamContent, base, baseAvailable: !!baseContent };
  }

  /**
   * Where a fork stands against its original: questions it changed (ahead), questions the original
   * changed since the fork's base (behind) and conflicts. With `details`, per-question diffs of the
   * original's changes (what a sync would bring).
   */
  public async status(forkId: string, viewerId?: string, details = false): Promise<any> {
    const c = await this.contents(forkId, viewerId);
    const entries = compareThreeWay(c.base.parsed, c.forkContent.parsed, c.upstreamContent.parsed);
    const role = await PackageMembersService.getInstance().getRole(forkId, viewerId);
    return {
      fork_id: forkId,
      upstream: { id: c.upstream.id, title: c.upstream.title, latest_version: c.upstream.latest_version, license: c.upstream.license },
      base_version: c.fork.forked_from_version,
      base_available: c.baseAvailable,
      ahead: entries.filter(e => e.source_status).length,
      behind: entries.filter(e => e.target_status).length,
      conflicts: entries.filter(e => e.conflict).length,
      can_sync: PackageMembersService.atLeast(role, 'editor'),
      next_version: await PackageContent.nextVersion(forkId),
      ...(details ? { incoming: PackageContent.changeViews(entries, 'target') } : {}),
    };
  }

  /**
   * Brings the original's changes since the base into the fork as a new fork version. Conflicts (both
   * changed a question differently) need a resolution: 'source' keeps the fork's question, 'target' takes
   * the original's. Without changes for the fork, only the base moves on.
   */
  public async sync(
    userId: string,
    forkId: string,
    input: { version?: string; release_notes?: string; resolutions?: Record<string, Resolution> },
  ): Promise<{ status: 'up_to_date' | 'base_moved' | 'merged'; version?: string; base_version: string }> {
    const knex = getDatabase();
    await PackageMembersService.getInstance().require(forkId, userId, 'editor', 'Nur Bearbeiter/innen des Forks können ihn abgleichen.');
    const c = await this.contents(forkId, userId);
    if (c.fork.forked_from_version === c.upstream.latest_version) {
      return { status: 'up_to_date', base_version: c.upstream.latest_version };
    }
    // Fork = source of the kept changes, original = target receiving them: merging the fork's changes into
    // the original's current version gives the synced fork.
    const merged = mergeThreeWay(c.base.parsed, c.forkContent.parsed, c.upstreamContent.parsed, flip(input.resolutions || {}));
    if (merged.unresolved.length) {
      const err = new Error(`CONFLICT: ${merged.unresolved.length} Frage(n) wurden im Fork und im Original unterschiedlich geändert. Wählen Sie für jede, welche Fassung gilt.`);
      (err as any).conflicts = merged.unresolved.map(e => e.key);
      throw err;
    }
    const newBase = c.upstream.latest_version;
    if (sameContent(parsePackage(merged.xml!), c.forkContent.parsed)) {
      await knex('packages').where({ id: forkId }).update({ forked_from_version: newBase });
      return { status: 'base_moved', base_version: newBase };
    }
    const version = input.version || await PackageContent.nextVersion(forkId);
    const notes = (input.release_notes || '').trim() || `Abgleich mit ${c.upstream.id} v${newBase}`;
    const manifest = await PackageContent.manifestFor(forkId, version, notes, c.fork.latest_version);
    await PackageService.getInstance().publishPackage(userId, manifest, merged.xml!);
    await knex('packages').where({ id: forkId }).update({ forked_from_version: newBase });
    return { status: 'merged', version, base_version: newBase };
  }
}

/**
 * Sync resolutions are given from the fork owner's view ('fork' = keep mine, 'upstream' = take the original's);
 * in the merge the fork is the source. Accepts 'source'/'target' as well.
 */
function flip(resolutions: Record<string, string>): Record<string, Resolution> {
  const out: Record<string, Resolution> = {};
  for (const [k, v] of Object.entries(resolutions)) {
    if (v === 'fork' || v === 'source') out[k] = 'source';
    else if (v === 'upstream' || v === 'target') out[k] = 'target';
  }
  return out;
}
