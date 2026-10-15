import { getDatabase } from '../database/connection';
import { AdminService } from './admin.service';
import { EmailService } from './email.service';

export type PackageRole = 'admin' | 'editor' | 'member';
const ROLES: PackageRole[] = ['member', 'editor', 'admin'];
const RANK: Record<PackageRole, number> = { member: 1, editor: 2, admin: 3 };

export const ROLE_LABEL: Record<PackageRole, string> = { admin: 'Admin', editor: 'Bearbeiter/in', member: 'Mitglied' };

export interface PackageMember {
  user_id: string;
  name: string;
  institution: string;
  /** Only for package admins and Hub admins. */
  email: string | null;
  role: PackageRole;
  is_creator: boolean;
  added_at: string | null;
}

/**
 * Roles on a package. The creator (packages.owner_id) is always admin and cannot be removed.
 * member: read access to a private package; editor: may also publish new versions;
 * admin: may also edit settings, manage members and access requests, and withdraw versions or the package.
 */
export class PackageMembersService {
  private static instance: PackageMembersService;

  public static getInstance(): PackageMembersService {
    if (!PackageMembersService.instance) {
      PackageMembersService.instance = new PackageMembersService();
    }
    return PackageMembersService.instance;
  }

  public static isRole(value: unknown): value is PackageRole {
    return typeof value === 'string' && (ROLES as string[]).includes(value);
  }

  public static atLeast(role: PackageRole | null, required: PackageRole): boolean {
    return !!role && RANK[role] >= RANK[required];
  }

  /** The user's role on a package, or null (no role, unknown package or anonymous). */
  public async getRole(packageId: string, userId?: string): Promise<PackageRole | null> {
    if (!userId) return null;
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first('owner_id');
    if (!pkg) return null;
    if (pkg.owner_id === userId) return 'admin';
    const row = await knex('package_members').where({ package_id: packageId, user_id: userId }).first('role');
    return PackageMembersService.isRole(row?.role) ? row.role : null;
  }

  /** Roles of one user for many packages (creator counts as admin). */
  public async getRoles(packageIds: string[], userId?: string): Promise<Map<string, PackageRole>> {
    const roles = new Map<string, PackageRole>();
    if (!userId || packageIds.length === 0) return roles;
    const knex = getDatabase();
    for (const row of await knex('package_members').where({ user_id: userId }).whereIn('package_id', packageIds)) {
      if (PackageMembersService.isRole(row.role)) roles.set(row.package_id, row.role);
    }
    for (const row of await knex('packages').where({ owner_id: userId }).whereIn('id', packageIds).select('id')) {
      roles.set(row.id, 'admin');
    }
    return roles;
  }

  /** Throws FORBIDDEN unless the user has at least the role (Hub admins pass every check). */
  public async require(packageId: string, userId: string, required: PackageRole, message: string): Promise<PackageRole | null> {
    const knex = getDatabase();
    if (!(await knex('packages').where({ id: packageId }).first('id'))) {
      throw new Error('NOT_FOUND: Paket nicht gefunden.');
    }
    const role = await this.getRole(packageId, userId);
    if (PackageMembersService.atLeast(role, required) || await AdminService.getInstance().isAdmin(userId)) {
      return role;
    }
    throw new Error(`FORBIDDEN: ${message}`);
  }

  /** Members of a package, creator first. Visible to everyone with a role; e-mail addresses only to admins. */
  public async list(packageId: string, viewerId: string): Promise<{ members: PackageMember[]; can_manage: boolean }> {
    const viewerRole = await this.require(packageId, viewerId, 'member', 'Nur Mitwirkende sehen die Mitglieder dieses Pakets.');
    const canManage = viewerRole === 'admin' || await AdminService.getInstance().isAdmin(viewerId);
    const knex = getDatabase();
    const pkg = await knex('packages').join('users', 'packages.owner_id', 'users.id').where({ 'packages.id': packageId })
      .first('users.id', 'users.full_name', 'users.institution', 'users.email', 'packages.created_at');
    const rows = await knex('package_members').join('users', 'package_members.user_id', 'users.id')
      .where({ 'package_members.package_id': packageId })
      .select('users.id', 'users.full_name', 'users.institution', 'users.email', 'package_members.role', 'package_members.created_at');
    const members: PackageMember[] = rows
      .filter(r => PackageMembersService.isRole(r.role))
      .map(r => ({
        user_id: r.id, name: r.full_name, institution: r.institution, email: canManage ? r.email : null,
        role: r.role as PackageRole, is_creator: false, added_at: new Date(r.created_at).toISOString(),
      }))
      .sort((a, b) => RANK[b.role] - RANK[a.role] || a.name.localeCompare(b.name, 'de'));
    return {
      can_manage: canManage,
      members: [{
        user_id: pkg.id, name: pkg.full_name, institution: pkg.institution, email: canManage ? pkg.email : null,
        role: 'admin', is_creator: true, added_at: null,
      }, ...members],
    };
  }

  /** Adds an existing Hub account by e-mail or changes its role; the person is notified by e-mail (best effort). */
  public async add(actorId: string, packageId: string, email: string, role: PackageRole): Promise<{ notification_sent: boolean }> {
    await this.require(packageId, actorId, 'admin', 'Nur Admins des Pakets können Mitglieder verwalten.');
    const knex = getDatabase();
    const user = await knex('users').whereRaw('LOWER(email) = ?', [email.trim().toLowerCase()]).first('id', 'email');
    if (!user) {
      throw new Error('NOT_FOUND: Kein Hub-Konto mit dieser E-Mail-Adresse. Die Person muss sich zuerst im Hub registrieren.');
    }
    await this.setRole(actorId, packageId, user.id, role);
    return { notification_sent: await this.notify(actorId, packageId, user.email, role) };
  }

  public async setRole(actorId: string, packageId: string, userId: string, role: PackageRole): Promise<void> {
    await this.require(packageId, actorId, 'admin', 'Nur Admins des Pakets können Mitglieder verwalten.');
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first('owner_id');
    if (pkg.owner_id === userId) {
      throw new Error('CONFLICT: Die Erstellerin oder der Ersteller bleibt immer Admin des Pakets.');
    }
    const now = new Date();
    const existing = await knex('package_members').where({ package_id: packageId, user_id: userId }).first();
    if (existing) {
      await knex('package_members').where({ package_id: packageId, user_id: userId }).update({ role, updated_at: now });
    } else {
      await knex('package_members').insert({ package_id: packageId, user_id: userId, role, created_at: now, updated_at: now });
    }
    // An open access request is answered by the membership.
    await knex('package_access_requests').where({ package_id: packageId, requester_id: userId, status: 'pending' })
      .update({ status: 'approved', updated_at: now });
  }

  /** Removes a member; an access request of that person is removed too, so they may ask again. */
  public async remove(actorId: string, packageId: string, userId: string): Promise<void> {
    await this.require(packageId, actorId, 'admin', 'Nur Admins des Pakets können Mitglieder verwalten.');
    const knex = getDatabase();
    const pkg = await knex('packages').where({ id: packageId }).first('owner_id');
    if (pkg.owner_id === userId) {
      throw new Error('CONFLICT: Die Erstellerin oder der Ersteller kann nicht entfernt werden.');
    }
    const removed = await knex('package_members').where({ package_id: packageId, user_id: userId }).del();
    if (!removed) throw new Error('NOT_FOUND: Diese Person ist kein Mitglied des Pakets.');
    await knex('package_access_requests').where({ package_id: packageId, requester_id: userId }).del();
  }

  /** Member, editor and admin counts per package (the creator counts as admin). */
  public async counts(): Promise<Map<string, { members: number; editors: number; admins: number }>> {
    const knex = getDatabase();
    const counts = new Map<string, { members: number; editors: number; admins: number }>();
    for (const pkg of await knex('packages').select('id')) {
      counts.set(pkg.id, { members: 0, editors: 0, admins: 1 });
    }
    for (const row of await knex('package_members').select('package_id', 'role')) {
      const c = counts.get(row.package_id);
      if (!c) continue;
      if (row.role === 'admin') c.admins += 1;
      else if (row.role === 'editor') c.editors += 1;
      else if (row.role === 'member') c.members += 1;
    }
    return counts;
  }

  private async notify(actorId: string, packageId: string, to: string, role: PackageRole): Promise<boolean> {
    if (!EmailService.isConfigured()) return false;
    const knex = getDatabase();
    const [actor, pkg] = await Promise.all([
      knex('users').where({ id: actorId }).first('full_name'),
      knex('packages').where({ id: packageId }).first('title'),
    ]);
    try {
      await EmailService.sendMembershipNotice({
        to, packageId, packageTitle: pkg.title, actorName: actor?.full_name || 'Ein Admin', role: ROLE_LABEL[role],
      });
      return true;
    } catch {
      return false;
    }
  }
}
