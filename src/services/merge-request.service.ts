import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { PackageService } from './package.service';
import { PackageMembersService } from './package-members.service';
import { AdminService } from './admin.service';
import { EmailService } from './email.service';
import { PackageContent } from './fork.service';
import { Resolution, compareThreeWay, mergeThreeWay, parsePackage, sameContent } from './question-xml.service';

type Status = 'open' | 'merging' | 'merged' | 'closed';
/** Statuses of a request that is still active ('merging' = being merged right now). */
export const ACTIVE_STATUSES = ['open', 'merging'];
/** A claim older than this is a crashed merge and is resolved on the next read. */
const STALE_MERGE_MS = 10 * 60 * 1000;

export interface MergeRequestNotice {
  to: string[];
  subject: string;
  lines: string[];
  url: string;
}

/**
 * Merge requests: the admins of a fork propose its changes to the original. Package admins of the
 * original (and Hub admins) merge or close them; anyone with access to the original can comment,
 * editors and admins can approve. Merging publishes a new version of the original.
 */
export class MergeRequestService {
  private static instance: MergeRequestService | null = null;
  /** Replaced in tests; best effort, never fails the action. */
  public notify: (n: MergeRequestNotice) => Promise<void> = async n => {
    if (!EmailService.isConfigured() || n.to.length === 0) return;
    await EmailService.sendMergeRequestNotice(n);
  };

  public static getInstance(): MergeRequestService {
    if (!MergeRequestService.instance) MergeRequestService.instance = new MergeRequestService();
    return MergeRequestService.instance;
  }

  private async isPackageAdmin(packageId: string, userId?: string): Promise<boolean> {
    if (!userId) return false;
    const role = await PackageMembersService.getInstance().getRole(packageId, userId);
    return role === 'admin' || await AdminService.getInstance().isAdmin(userId);
  }

  private async isPackageEditor(packageId: string, userId?: string): Promise<boolean> {
    if (!userId) return false;
    const role = await PackageMembersService.getInstance().getRole(packageId, userId);
    return PackageMembersService.atLeast(role, 'editor') || await AdminService.getInstance().isAdmin(userId);
  }

  private async canAccess(packageId: string, userId?: string): Promise<boolean> {
    return await PackageService.getInstance().canAccessPackage(packageId, userId)
      || (!!userId && await AdminService.getInstance().isAdmin(userId));
  }

  private async requireAccess(targetId: string, userId?: string): Promise<any> {
    const target = await getDatabase()('packages').where({ id: targetId }).first();
    if (!target) throw new Error('NOT_FOUND: Paket nicht gefunden.');
    if (!(await this.canAccess(targetId, userId))) {
      throw new Error('FORBIDDEN: Kein Zugriff auf dieses Paket.');
    }
    return target;
  }

  private async load(targetId: string, number: number): Promise<any> {
    const knex = getDatabase();
    const mr = await knex('merge_requests').where({ target_package_id: targetId, number }).first();
    if (!mr) throw new Error('NOT_FOUND: Änderungsvorschlag nicht gefunden.');
    if (mr.status === 'merging' && Date.now() - new Date(mr.updated_at).getTime() > STALE_MERGE_MS) {
      await this.recoverClaim(mr);
      return knex('merge_requests').where({ id: mr.id }).first();
    }
    return mr;
  }

  /**
   * Resolves a merge that was interrupted (crash, failed final write): merged if the target already has the
   * version it was going to publish, else open again.
   */
  private async recoverClaim(mr: any): Promise<void> {
    const knex = getDatabase();
    const published = mr.merged_version
      ? await knex('releases').where({ package_id: mr.target_package_id, version: mr.merged_version }).first('id')
      : null;
    if (published) {
      await knex('merge_requests').where({ id: mr.id, status: 'merging' })
        .update({ status: 'merged', closed_at: new Date(), updated_at: new Date() });
    } else {
      await knex('merge_requests').where({ id: mr.id, status: 'merging' }).update({ status: 'open', merged_version: null, updated_at: new Date() });
    }
  }

  private url(targetId: string, number: number): string {
    return `${EmailService.baseUrl()}/packages/${encodeURIComponent(targetId)}/merge-requests/${number}`;
  }

  /** E-mail addresses of the target's admins, the MR author and everyone who commented, minus the actor. */
  private async participants(mr: any, actorId: string, includeCommenters = true): Promise<string[]> {
    const knex = getDatabase();
    const target = await knex('packages').where({ id: mr.target_package_id }).first('owner_id');
    const ids = new Set<string>();
    if (target) ids.add(target.owner_id);
    for (const id of await knex('package_members').where({ package_id: mr.target_package_id, role: 'admin' }).pluck('user_id')) ids.add(id);
    if (mr.author_id) ids.add(mr.author_id);
    if (includeCommenters) {
      for (const id of await knex('merge_request_notes').where({ merge_request_id: mr.id, kind: 'comment' }).whereNotNull('author_id').distinct().pluck('author_id')) ids.add(id);
    }
    ids.delete(actorId);
    const allowed: string[] = [];
    for (const id of ids) if (await this.canAccess(mr.target_package_id, id)) allowed.push(id);
    if (allowed.length === 0) return [];
    return knex('users').whereIn('id', allowed).pluck('email');
  }

  private async addNote(mrId: string, authorId: string | null, kind: 'comment' | 'system', body: string, question?: { key: string; name: string }) {
    const now = new Date();
    const note = {
      id: crypto.randomUUID(), merge_request_id: mrId, author_id: authorId, kind, body,
      question_key: question?.key ?? null, question_name: question?.name?.slice(0, 255) ?? null,
      resolved: false, created_at: now, updated_at: now,
    };
    await getDatabase()('merge_request_notes').insert(note);
    await getDatabase()('merge_requests').where({ id: mrId }).update({ updated_at: now });
    return note;
  }

  private async userName(userId: string): Promise<string> {
    return (await getDatabase()('users').where({ id: userId }).first('full_name'))?.full_name || 'Jemand';
  }

  private safeNotify(n: MergeRequestNotice): void {
    this.notify(n).catch(() => { /* best effort */ });
  }

  // ---------------------------------------------------------------------------------------------- create

  public async create(userId: string, targetId: string, input: { source_package_id?: unknown; title?: unknown; description?: unknown; accept_license?: unknown }): Promise<{ number: number; id: string }> {
    const knex = getDatabase();
    const target = await this.requireAccess(targetId, userId);
    const sourceId = String(input.source_package_id || '');
    const source = await knex('packages').where({ id: sourceId }).first();
    if (!source) throw new Error('NOT_FOUND: Fork nicht gefunden.');
    if (source.forked_from_id !== targetId) throw new Error('BAD_REQUEST: Änderungsvorschläge gehen nur von einem Fork an sein Ursprungspaket.');
    if (!(await this.isPackageEditor(sourceId, userId))) throw new Error('FORBIDDEN: Nur Bearbeiter/innen des Forks können einen Änderungsvorschlag stellen.');
    const title = String(input.title || '').trim();
    if (title.length < 3 || title.length > 200) throw new Error('BAD_REQUEST: Der Titel muss 3 bis 200 Zeichen lang sein.');
    const description = String(input.description || '').trim();
    if (description.length > 20000) throw new Error('BAD_REQUEST: Die Beschreibung darf höchstens 20000 Zeichen lang sein.');
    if (input.accept_license !== true) {
      throw new Error(`BAD_REQUEST: Bestätigen Sie, dass Ihre Änderungen unter der Lizenz des Originals (${target.license}) stehen.`);
    }

    const { entries, baseAvailable } = await this.compare(source, target);
    if (!baseAvailable) {
      throw new Error(`CONFLICT: Version ${source.forked_from_version} des Originals, auf der der Fork beruht, wurde zurückgezogen. Ein Änderungsvorschlag lässt sich so nicht sicher übernehmen.`);
    }
    if (!entries.some(e => e.source_status)) throw new Error('BAD_REQUEST: Der Fork enthält keine Änderungen gegenüber dem Original.');

    const id = crypto.randomUUID();
    let number = 0;
    try {
      await knex.transaction(async trx => {
        // Locks the target row (MariaDB), so parallel requests get distinct numbers and see each other's open request.
        await trx('packages').where({ id: targetId }).forUpdate().first('id');
        const open = await trx('merge_requests').where({ target_package_id: targetId, source_package_id: sourceId })
          .whereIn('status', ['open', 'merging']).first('number');
        if (open) throw new Error(`CONFLICT: Für diesen Fork ist Änderungsvorschlag !${open.number} bereits offen.`);
        const max = await trx('merge_requests').where({ target_package_id: targetId }).max<{ m: number }>('number as m').first();
        number = Number(max?.m || 0) + 1;
        const now = new Date();
        await trx('merge_requests').insert({
          id, target_package_id: targetId, number, source_package_id: sourceId, author_id: userId,
          title, description: description || null, status: 'open', created_at: now, updated_at: now,
        });
      });
    } catch (err: any) {
      if (['ER_DUP_ENTRY', 'SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_UNIQUE'].includes(String(err?.code)) || err?.errno === 1062) {
        throw new Error('CONFLICT: Gleichzeitig wurde ein anderer Änderungsvorschlag erstellt. Bitte erneut versuchen.');
      }
      throw err;
    }

    const author = await this.userName(userId);
    const mr = await knex('merge_requests').where({ id }).first();
    this.safeNotify({
      to: await this.participants(mr, userId, false),
      subject: `Änderungsvorschlag !${number} für «${target.title}»: ${title}`,
      lines: [
        `${author} schlägt Änderungen aus dem Fork «${source.title}» für Ihr Fragenpaket «${target.title}» vor.`,
        ...(description ? ['', description.slice(0, 2000)] : []),
      ],
      url: this.url(targetId, number),
    });
    return { number, id };
  }

  /** Three-way comparison of a fork with its original (base = the original's version the fork is based on). */
  private async compare(source: any, target: any, versions?: { base?: string | null; source?: string | null; target?: string | null }) {
    const baseVersion = versions?.base ?? source.forked_from_version;
    const [s, t, b] = await Promise.all([
      PackageContent.read(source.id, versions?.source ?? source.latest_version),
      PackageContent.read(target.id, versions?.target ?? target.latest_version),
      PackageContent.read(target.id, baseVersion),
    ]);
    if (!s || !t) throw new Error('NOT_FOUND: Eine Paketdatei ist nicht lesbar.');
    const base = b ?? t;
    return { entries: compareThreeWay(base.parsed, s.parsed, t.parsed), base, s, t, baseAvailable: !!b, baseVersion };
  }

  // ---------------------------------------------------------------------------------------------- read

  public async list(targetId: string, viewerId: string | undefined, status: string): Promise<any[]> {
    await this.requireAccess(targetId, viewerId);
    const knex = getDatabase();
    let q = knex('merge_requests').leftJoin('users', 'merge_requests.author_id', 'users.id')
      .where({ 'merge_requests.target_package_id': targetId });
    if (status === 'open') q = q.whereIn('merge_requests.status', ACTIVE_STATUSES);
    else if (status === 'merged' || status === 'closed') q = q.where({ 'merge_requests.status': status });
    const rows = await q.select('merge_requests.*', 'users.full_name as author_name').orderBy('merge_requests.number', 'desc');
    const counts = rows.length ? await knex('merge_request_notes').whereIn('merge_request_id', rows.map(r => r.id))
      .where({ kind: 'comment' }).groupBy('merge_request_id').select('merge_request_id').count<{ merge_request_id: string; c: number }[]>('id as c') : [];
    const byId = new Map((counts as any[]).map(c => [c.merge_request_id, Number(c.c)]));
    return rows.map(r => this.summary(r, byId.get(r.id) || 0));
  }

  private summary(r: any, comments: number) {
    return {
      id: r.id, number: r.number, title: r.title, status: r.status as Status,
      target_package_id: r.target_package_id, source_package_id: r.source_package_id,
      author: { id: r.author_id, name: r.author_name || 'Gelöschtes Konto' },
      merged_version: r.merged_version || null,
      comments_count: comments,
      created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString(),
      closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    };
  }

  /** Open merge requests the user authored or may review (editor or admin of the target). */
  public async listForAccount(userId: string): Promise<{ authored: any[]; to_review: any[] }> {
    const knex = getDatabase();
    const reviewable = knex('package_members').where({ user_id: userId }).whereIn('role', ['editor', 'admin']).select('package_id');
    const owned = knex('packages').where({ owner_id: userId }).select('id');
    const base = () => knex('merge_requests')
      .leftJoin('users', 'merge_requests.author_id', 'users.id')
      .join('packages', 'merge_requests.target_package_id', 'packages.id')
      .select('merge_requests.*', 'users.full_name as author_name', 'packages.title as target_title')
      .orderBy('merge_requests.updated_at', 'desc');
    const authored = await base().where({ 'merge_requests.author_id': userId }).limit(50);
    const toReview = await base().whereIn('merge_requests.status', ACTIVE_STATUSES)
      .where(q => q.whereIn('merge_requests.target_package_id', owned).orWhereIn('merge_requests.target_package_id', reviewable))
      .limit(50);
    const visibleAuthored = [];
    for (const r of authored) if (await this.canAccess(r.target_package_id, userId)) visibleAuthored.push(r);
    authored.length = 0;
    authored.push(...visibleAuthored);
    const ids = [...authored, ...toReview].map(r => r.id);
    const counts = ids.length ? await knex('merge_request_notes').whereIn('merge_request_id', ids).where({ kind: 'comment' })
      .groupBy('merge_request_id').select('merge_request_id').count<any[]>('id as c') : [];
    const byId = new Map((counts as any[]).map(c => [c.merge_request_id, Number(c.c)]));
    const map = (r: any) => ({ ...this.summary(r, byId.get(r.id) || 0), target_title: r.target_title });
    return { authored: authored.map(map), to_review: toReview.map(map) };
  }

  public async get(targetId: string, number: number, viewerId?: string): Promise<any> {
    const knex = getDatabase();
    const target = await this.requireAccess(targetId, viewerId);
    const mr = await this.load(targetId, number);
    const source = await knex('packages').where({ id: mr.source_package_id }).first();
    const author = mr.author_id ? await knex('users').where({ id: mr.author_id }).first('id', 'full_name', 'institution') : null;
    const notes = await knex('merge_request_notes').leftJoin('users', 'merge_request_notes.author_id', 'users.id')
      .where({ merge_request_id: mr.id }).orderBy('merge_request_notes.created_at', 'asc').orderBy('merge_request_notes.kind', 'asc')
      .select('merge_request_notes.*', 'users.full_name as author_name');
    const approvals = await knex('merge_request_approvals').join('users', 'merge_request_approvals.user_id', 'users.id')
      .where({ merge_request_id: mr.id })
      .select('users.id as user_id', 'users.full_name as name', 'merge_request_approvals.created_at', 'merge_request_approvals.source_version');

    const isAdmin = await this.isPackageAdmin(targetId, viewerId);
    const isEditor = await this.isPackageEditor(targetId, viewerId);
    const isAuthor = !!viewerId && viewerId === mr.author_id;
    const canSeeSource = !!source && await this.canAccess(source.id, viewerId);

    // Live mergeability for open merge requests.
    let mergeability: any = null;
    if (mr.status === 'merging') {
      mergeability = { mergeable: false, reason: 'Der Änderungsvorschlag wird gerade übernommen.' };
    } else if (mr.status === 'open') {
      if (!source || source.forked_from_id !== targetId) {
        mergeability = { mergeable: false, reason: 'Der Fork existiert nicht mehr.' };
      } else {
        try {
          const c = await this.compare(source, target);
          const changes = c.entries.filter(e => e.source_status).length;
          const conflicts = c.entries.filter(e => e.conflict).length;
          // Changes the original already contains in the same form would not change it.
          const effective = c.entries.some(e => e.source_status && (e.source?.norm ?? null) !== (e.target?.norm ?? null));
          mergeability = {
            mergeable: effective && c.baseAvailable,
            changes, conflicts,
            reason: !c.baseAvailable
              ? `Version ${source.forked_from_version} des Originals, auf der der Fork beruht, wurde zurückgezogen. Ohne sie lassen sich die Änderungen nicht sicher übernehmen.`
              : !effective ? 'Der Fork enthält keine Änderungen (mehr), die das Original nicht schon hat.' : null,
            base_version: source.forked_from_version, base_available: c.baseAvailable,
            source_version: source.latest_version, target_version: target.latest_version,
            next_version: await PackageContent.nextVersion(targetId),
          };
        } catch (e: any) {
          mergeability = { mergeable: false, reason: String(e.message || '').replace(/^[A-Z_]+: /, '') };
        }
      }
    }

    // Viewers who may not see a private fork learn neither its versions nor its size.
    if (mergeability && !canSeeSource && !isEditor) {
      mergeability = { mergeable: mergeability.mergeable, reason: mergeability.reason };
    }

    return {
      id: mr.id, number: mr.number, title: mr.title, description: mr.description || '', status: mr.status as Status,
      author: author ? { id: author.id, name: author.full_name, institution: author.institution } : { id: null, name: 'Gelöschtes Konto', institution: '' },
      target: { id: target.id, title: target.title, latest_version: target.latest_version, license: target.license },
      source: source
        ? { id: source.id, title: canSeeSource ? source.title : 'Privater Fork', latest_version: canSeeSource ? source.latest_version : null, exists: true, can_access: canSeeSource }
        : { id: mr.source_package_id, title: null, latest_version: null, exists: false, can_access: false },
      merge_base_version: mr.merge_base_version, merged_source_version: mr.merged_source_version,
      merged_target_version: mr.merged_target_version, merged_version: mr.merged_version,
      closed_at: mr.closed_at ? new Date(mr.closed_at).toISOString() : null,
      created_at: new Date(mr.created_at).toISOString(), updated_at: new Date(mr.updated_at).toISOString(),
      notes: notes.map(n => ({
        id: n.id, kind: n.kind, body: n.body, question_key: n.question_key, question_name: n.question_name,
        resolved: !!n.resolved, author: { id: n.author_id, name: n.author_name || 'Gelöschtes Konto' },
        created_at: new Date(n.created_at).toISOString(), updated_at: new Date(n.updated_at).toISOString(),
        can_edit: n.kind === 'comment' && !!viewerId && viewerId === n.author_id,
        can_delete: n.kind === 'comment' && !!viewerId && (viewerId === n.author_id || isAdmin),
      })),
      // An approval belongs to the fork version it was given for; a newer fork version makes it outdated.
      approvals: approvals.map(a => ({
        user_id: a.user_id, name: a.name, created_at: new Date(a.created_at).toISOString(),
        source_version: a.source_version || null, outdated: !!source && a.source_version !== source.latest_version,
      })),
      mergeability,
      permissions: {
        can_comment: !!viewerId,
        can_approve: isEditor && mr.status === 'open',
        approved_by_me: approvals.some(a => a.user_id === viewerId && (!source || a.source_version === source.latest_version)),
        can_merge: isAdmin && mr.status === 'open' && !!mergeability?.mergeable,
        can_close: (isAdmin || isAuthor) && mr.status === 'open',
        can_reopen: (isAdmin || isAuthor) && mr.status === 'closed' && !!source && source.forked_from_id === targetId,
        can_edit: (isAdmin || isAuthor) && mr.status === 'open',
        can_resolve: isEditor || isAuthor,
      },
    };
  }

  /** Per-question changes of the fork (what merging brings), with conflicts against the original. */
  public async changes(targetId: string, number: number, viewerId?: string): Promise<any> {
    const knex = getDatabase();
    const target = await this.requireAccess(targetId, viewerId);
    const mr = await this.load(targetId, number);
    // The diff shows the fork's questions: only for people who may see the fork, and for the reviewers of the original.
    const sourceRow = await knex('packages').where({ id: mr.source_package_id }).first('id');
    if (!(sourceRow && await this.canAccess(sourceRow.id, viewerId)) && !(await this.isPackageEditor(targetId, viewerId))) {
      return { available: false, reason: 'Der Fork ist privat oder existiert nicht mehr; seine Änderungen sind nur für Berechtigte sichtbar.', changes: [] };
    }
    if (mr.status === 'merged') {
      const c = await this.compare({ id: mr.source_package_id, forked_from_version: mr.merge_base_version }, target, {
        base: mr.merge_base_version, source: mr.merged_source_version, target: mr.merged_target_version,
      }).catch(() => null);
      if (!c) return { available: false, reason: 'Die verglichenen Versionen sind nicht mehr verfügbar.', changes: [] };
      return {
        available: true, base_version: mr.merge_base_version, source_version: mr.merged_source_version,
        target_version: mr.merged_target_version, base_available: c.baseAvailable,
        changes: PackageContent.changeViews(c.entries, 'source'),
      };
    }
    const source = await knex('packages').where({ id: mr.source_package_id }).first();
    if (!source) return { available: false, reason: 'Der Fork existiert nicht mehr.', changes: [] };
    const c = await this.compare(source, target);
    return {
      available: true, base_version: source.forked_from_version, source_version: source.latest_version,
      target_version: target.latest_version, base_available: c.baseAvailable,
      changes: PackageContent.changeViews(c.entries, 'source'),
    };
  }

  // ---------------------------------------------------------------------------------------------- update

  public async update(userId: string, targetId: string, number: number, patch: { title?: unknown; description?: unknown; status?: unknown }): Promise<void> {
    const knex = getDatabase();
    const target = await this.requireAccess(targetId, userId);
    const mr = await this.load(targetId, number);
    const isAdmin = await this.isPackageAdmin(targetId, userId);
    if (!(isAdmin || mr.author_id === userId)) throw new Error('FORBIDDEN: Nur die Autorin/der Autor oder Admins des Pakets können den Änderungsvorschlag ändern.');
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined || patch.description !== undefined) {
      if (mr.status !== 'open') throw new Error('CONFLICT: Nur offene Änderungsvorschläge können bearbeitet werden.');
      if (patch.title !== undefined) {
        const t = String(patch.title).trim();
        if (t.length < 3 || t.length > 200) throw new Error('BAD_REQUEST: Der Titel muss 3 bis 200 Zeichen lang sein.');
        update.title = t;
      }
      if (patch.description !== undefined) {
        const d = String(patch.description ?? '').trim();
        if (d.length > 20000) throw new Error('BAD_REQUEST: Die Beschreibung darf höchstens 20000 Zeichen lang sein.');
        update.description = d || null;
      }
    }
    let event: 'closed' | 'reopened' | null = null;
    if (patch.status !== undefined) {
      if (patch.status === 'closed' && mr.status === 'open') {
        Object.assign(update, { status: 'closed', closed_by: userId, closed_at: new Date() });
        event = 'closed';
      } else if (patch.status === 'open' && mr.status === 'closed') {
        const fork = await knex('packages').where({ id: mr.source_package_id }).first('forked_from_id');
        if (!fork || fork.forked_from_id !== targetId) throw new Error('CONFLICT: Der Fork existiert nicht mehr.');
        const other = await knex('merge_requests').where({ target_package_id: targetId, source_package_id: mr.source_package_id })
          .whereIn('status', ACTIVE_STATUSES).first('number');
        if (other) throw new Error(`CONFLICT: Für diesen Fork ist Änderungsvorschlag !${other.number} bereits offen.`);
        Object.assign(update, { status: 'open', closed_by: null, closed_at: null });
        event = 'reopened';
      } else {
        throw new Error('BAD_REQUEST: Ungültige Statusänderung.');
      }
    }
    if (Object.keys(update).length === 0) return;
    await knex('merge_requests').where({ id: mr.id }).update({ ...update, updated_at: new Date() });
    if (event) {
      await this.addNote(mr.id, userId, 'system', event === 'closed' ? 'hat den Änderungsvorschlag geschlossen.' : 'hat den Änderungsvorschlag wieder geöffnet.');
      const actor = await this.userName(userId);
      this.safeNotify({
        to: await this.participants(mr, userId),
        subject: `Änderungsvorschlag !${number} für «${target.title}» ${event === 'closed' ? 'geschlossen' : 'wieder geöffnet'}`,
        lines: [`${actor} hat den Änderungsvorschlag «${mr.title}» ${event === 'closed' ? 'geschlossen' : 'wieder geöffnet'}.`],
        url: this.url(targetId, number),
      });
    }
  }

  public async comment(userId: string, targetId: string, number: number, input: { body?: unknown; question_key?: unknown; question_name?: unknown }) {
    const target = await this.requireAccess(targetId, userId);
    const mr = await this.load(targetId, number);
    const body = String(input.body || '').trim();
    if (!body) throw new Error('BAD_REQUEST: Der Kommentar ist leer.');
    if (body.length > 10000) throw new Error('BAD_REQUEST: Der Kommentar darf höchstens 10000 Zeichen lang sein.');
    const key = typeof input.question_key === 'string' && /^[0-9a-f]{32}$/.test(input.question_key) ? input.question_key : null;
    const note = await this.addNote(mr.id, userId, 'comment', body,
      key ? { key, name: String(input.question_name || '').trim() || 'Frage' } : undefined);
    const actor = await this.userName(userId);
    this.safeNotify({
      to: await this.participants(mr, userId),
      subject: `Neuer Kommentar zu Änderungsvorschlag !${number} für «${target.title}»`,
      lines: [
        `${actor} hat ${key ? `zur Frage «${note.question_name}» ` : ''}kommentiert:`, '', body.slice(0, 2000),
      ],
      url: this.url(targetId, number),
    });
    return { id: note.id };
  }

  public async editNote(userId: string, targetId: string, number: number, noteId: string, patch: { body?: unknown; resolved?: unknown }) {
    const knex = getDatabase();
    await this.requireAccess(targetId, userId);
    const mr = await this.load(targetId, number);
    const note = await knex('merge_request_notes').where({ id: noteId, merge_request_id: mr.id }).first();
    if (!note || note.kind !== 'comment') throw new Error('NOT_FOUND: Kommentar nicht gefunden.');
    const update: Record<string, unknown> = {};
    if (patch.body !== undefined) {
      if (note.author_id !== userId) throw new Error('FORBIDDEN: Nur eigene Kommentare können bearbeitet werden.');
      const body = String(patch.body || '').trim();
      if (!body || body.length > 10000) throw new Error('BAD_REQUEST: Der Kommentar muss 1 bis 10000 Zeichen lang sein.');
      update.body = body;
      update.updated_at = new Date();
    }
    if (patch.resolved !== undefined) {
      if (!(mr.author_id === userId || await this.isPackageEditor(targetId, userId))) {
        throw new Error('FORBIDDEN: Nur die Autorin/der Autor oder Bearbeiter/innen des Pakets können Diskussionen erledigen.');
      }
      update.resolved = !!patch.resolved;
    }
    if (Object.keys(update).length) await knex('merge_request_notes').where({ id: noteId }).update(update);
  }

  public async deleteNote(userId: string, targetId: string, number: number, noteId: string) {
    const knex = getDatabase();
    await this.requireAccess(targetId, userId);
    const mr = await this.load(targetId, number);
    const note = await knex('merge_request_notes').where({ id: noteId, merge_request_id: mr.id }).first();
    if (!note || note.kind !== 'comment') throw new Error('NOT_FOUND: Kommentar nicht gefunden.');
    if (!(note.author_id === userId || await this.isPackageAdmin(targetId, userId))) {
      throw new Error('FORBIDDEN: Nur eigene Kommentare können gelöscht werden.');
    }
    await knex('merge_request_notes').where({ id: noteId }).del();
  }

  public async setApproval(userId: string, targetId: string, number: number, approve: boolean) {
    const knex = getDatabase();
    await this.requireAccess(targetId, userId);
    const mr = await this.load(targetId, number);
    if (mr.status !== 'open') throw new Error('CONFLICT: Nur offene Änderungsvorschläge können genehmigt werden.');
    if (!(await this.isPackageEditor(targetId, userId))) throw new Error('FORBIDDEN: Nur Bearbeiter/innen und Admins des Pakets können genehmigen.');
    const existing = await knex('merge_request_approvals').where({ merge_request_id: mr.id, user_id: userId }).first();
    const sourceVersion = (await knex('packages').where({ id: mr.source_package_id }).first('latest_version'))?.latest_version || null;
    if (approve && (!existing || existing.source_version !== sourceVersion)) {
      // The approval is for the fork version reviewed now; a newer fork version makes it outdated.
      await knex('merge_request_approvals').where({ merge_request_id: mr.id, user_id: userId }).del();
      await knex('merge_request_approvals').insert({ merge_request_id: mr.id, user_id: userId, source_version: sourceVersion, created_at: new Date() });
      await this.addNote(mr.id, userId, 'system', `hat den Änderungsvorschlag genehmigt${sourceVersion ? ` (Fork-Version ${sourceVersion})` : ''}.`);
    } else if (!approve && existing) {
      await knex('merge_request_approvals').where({ merge_request_id: mr.id, user_id: userId }).del();
      await this.addNote(mr.id, userId, 'system', 'hat die Genehmigung zurückgenommen.');
    }
  }

  /**
   * Merges the fork's changes into the original as a new version. Questions only the original changed
   * stay; conflicts need a resolution per question ('source' = fork, 'target' = original).
   */
  public async merge(userId: string, targetId: string, number: number, input: {
    version?: unknown; release_notes?: unknown; resolutions?: unknown; source_version?: unknown; target_version?: unknown;
  }) {
    const knex = getDatabase();
    const target = await this.requireAccess(targetId, userId);
    const mr = await this.load(targetId, number);
    if (mr.status !== 'open') throw new Error('CONFLICT: Dieser Änderungsvorschlag ist nicht offen.');
    if (!(await this.isPackageAdmin(targetId, userId))) throw new Error('FORBIDDEN: Nur Admins des Pakets können Änderungsvorschläge übernehmen.');
    const source = await knex('packages').where({ id: mr.source_package_id }).first();
    if (!source || source.forked_from_id !== targetId) throw new Error('CONFLICT: Der Fork existiert nicht mehr.');
    // What was reviewed must be what is merged: a newer fork or original version since the page was loaded is refused.
    if (typeof input.source_version !== 'string' || typeof input.target_version !== 'string') {
      throw new Error('BAD_REQUEST: source_version und target_version (die geprüften Versionen) sind nötig.');
    }
    if (input.source_version !== source.latest_version) {
      throw new Error(`CONFLICT: Der Fork hat inzwischen Version ${source.latest_version}. Laden Sie die Seite neu und prüfen Sie die Änderungen erneut.`);
    }
    if (input.target_version !== target.latest_version) {
      throw new Error(`CONFLICT: Das Paket hat inzwischen Version ${target.latest_version}. Laden Sie die Seite neu und prüfen Sie die Änderungen erneut.`);
    }

    const resolutions: Record<string, Resolution> = {};
    if (input.resolutions && typeof input.resolutions === 'object') {
      for (const [k, v] of Object.entries(input.resolutions as Record<string, unknown>)) {
        if (v === 'source' || v === 'target') resolutions[k] = v;
      }
    }
    const c = await this.compare(source, target);
    if (!c.baseAvailable) {
      throw new Error(`CONFLICT: Version ${source.forked_from_version} des Originals, auf der der Fork beruht, wurde zurückgezogen. Ohne sie lassen sich die Änderungen nicht sicher übernehmen.`);
    }
    const merged = mergeThreeWay(c.base.parsed, c.s.parsed, c.t.parsed, resolutions);
    if (merged.unresolved.length) {
      const err = new Error(`CONFLICT: ${merged.unresolved.length} Frage(n) wurden im Fork und im Original unterschiedlich geändert. Wählen Sie für jede, welche Fassung übernommen wird.`);
      (err as any).conflicts = merged.unresolved.map(e => e.key);
      throw err;
    }
    if (!merged.changed) throw new Error('CONFLICT: Die Übernahme würde das Paket nicht verändern.');

    const version = typeof input.version === 'string' && input.version.trim() ? input.version.trim() : await PackageContent.nextVersion(targetId);
    const author = mr.author_id ? await this.userName(mr.author_id) : 'Gelöschtes Konto';
    const notes = (typeof input.release_notes === 'string' && input.release_notes.trim())
      || `Änderungsvorschlag !${mr.number} von ${author}: ${mr.title}`;
    const manifest = await PackageContent.manifestFor(targetId, version, notes, target.latest_version);

    // Claim the request, so a double click or a second admin cannot publish it twice.
    const claimed = await knex('merge_requests').where({ id: mr.id, status: 'open' })
      .update({ status: 'merging', merged_version: version, updated_at: new Date() });
    if (claimed !== 1) throw new Error('CONFLICT: Dieser Änderungsvorschlag wird bereits übernommen.');
    let published: Awaited<ReturnType<PackageService['publishPackage']>>;
    try {
      published = await PackageService.getInstance().publishPackage(userId, manifest, merged.xml!, { asPackageAdmin: true });
    } catch (err) {
      await knex('merge_requests').where({ id: mr.id, status: 'merging' }).update({ status: 'open', merged_version: null });
      throw err;
    }

    const now = new Date();
    // The version is published: the request must end up merged even if this bookkeeping fails once (then the
    // stale-claim recovery in load() finishes it).
    const finish = () => knex.transaction(async trx => {
      await trx('merge_requests').where({ id: mr.id }).update({
        status: 'merged', merge_base_version: c.baseVersion, merged_source_version: source.latest_version,
        merged_target_version: target.latest_version, merged_version: version, closed_by: userId, closed_at: now, updated_at: now,
      });
      await trx('merge_request_notes').insert({
        id: crypto.randomUUID(), merge_request_id: mr.id, author_id: userId, kind: 'system',
        body: `hat den Änderungsvorschlag als Version ${version} übernommen.`, resolved: false, created_at: now, updated_at: now,
      });
      // The fork now matches the original: later comparisons start from the merged version.
      if (sameContent(parsePackage(merged.xml!), c.s.parsed)) {
        await trx('packages').where({ id: source.id }).update({ forked_from_version: version });
      }
    });
    try {
      await finish();
    } catch {
      await finish().catch(() => { /* recovered on the next read */ });
    }

    const actor = await this.userName(userId);
    this.safeNotify({
      to: await this.participants(mr, userId),
      subject: `Änderungsvorschlag !${number} für «${target.title}» übernommen`,
      lines: [`${actor} hat den Änderungsvorschlag «${mr.title}» übernommen: «${target.title}» Version ${version}.`],
      url: this.url(targetId, number),
    });
    return { version, github: published.github };
  }
}
