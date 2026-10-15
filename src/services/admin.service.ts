import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { PackageStorageService } from './package-storage.service';

export interface AdminPackageSummary {
  id: string;
  title: string;
  latest_version: string;
  visibility: 'public' | 'private';
  downloads_count: number;
  release_count: number;
  withdrawn_release_count: number;
  updated_at: string;
}

export interface AdminWithdrawnPackage {
  id: string;
  owner_id: string;
  owner_email: string | null;
  last_version: string;
  withdrawn_at: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  full_name: string;
  institution: string;
  canton: string;
  role: 'teacher' | 'admin';
  created_at: string;
  packages: AdminPackageSummary[];
  withdrawn: AdminWithdrawnPackage[];
}

/** Read-mostly administration: every user with their packages, and final deletion of withdrawn packages. */
export class AdminService {
  private static instance: AdminService;

  public static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  /** The role is read from the database, so a changed role applies without a new login. */
  public async isAdmin(userId: string): Promise<boolean> {
    const row = await getDatabase()('users').where({ id: userId }).first('role');
    return row?.role === 'admin';
  }

  public async overview(): Promise<{ users: AdminUserSummary[]; withdrawn: AdminWithdrawnPackage[]; email_enabled: boolean }> {
    const knex = getDatabase();
    const users = await knex('users')
      .select('id', 'email', 'full_name', 'institution', 'canton', 'role', 'created_at')
      .orderBy('email');
    const packages = await knex('packages').orderBy('title');
    const releases = await knex('releases').select('package_id', 'is_yanked');
    const tombstones = await knex('withdrawn_packages').orderBy('withdrawn_at', 'desc');
    const emails = new Map(users.map(u => [u.id, u.email]));

    const withdrawn: AdminWithdrawnPackage[] = tombstones.map(t => ({
      id: t.id,
      owner_id: t.owner_id,
      owner_email: emails.get(t.owner_id) ?? null,
      last_version: t.last_version,
      withdrawn_at: new Date(t.withdrawn_at).toISOString(),
    }));

    return {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        institution: u.institution,
        canton: u.canton,
        role: u.role === 'admin' ? 'admin' : 'teacher',
        created_at: new Date(u.created_at).toISOString(),
        packages: packages
          .filter(p => p.owner_id === u.id)
          .map(p => {
            const own = releases.filter(r => r.package_id === p.id);
            return {
              id: p.id,
              title: p.title,
              latest_version: p.latest_version,
              visibility: p.visibility === 'private' ? 'private' : 'public',
              downloads_count: p.downloads_count,
              release_count: own.filter(r => !r.is_yanked).length,
              withdrawn_release_count: own.filter(r => !!r.is_yanked).length,
              updated_at: new Date(p.updated_at).toISOString(),
            } as AdminPackageSummary;
          }),
        withdrawn: withdrawn.filter(w => w.owner_id === u.id),
      })),
      withdrawn,
      email_enabled: EmailService.isConfigured(),
    };
  }

  /**
   * Creates an account like a registration. Without a password, a random initial password is generated
   * and returned once, for the admin to pass on (it is never stored in plain text or emailed).
   */
  public async createUser(data: {
    email: string; full_name: string; institution: string; canton: string; role: 'teacher' | 'admin'; password?: string;
  }): Promise<{ user: AdminUserSummary; initial_password?: string }> {
    const generated = data.password ? undefined : crypto.randomBytes(12).toString('base64url');
    const { userId } = await AuthService.getInstance().register({
      email: data.email, full_name: data.full_name, institution: data.institution, canton: data.canton,
      password: data.password || (generated as string),
    });
    if (data.role === 'admin') {
      await getDatabase()('users').where({ id: userId }).update({ role: 'admin', updated_at: new Date() });
    }
    const user = (await this.overview()).users.find(u => u.id === userId) as AdminUserSummary;
    return { user, ...(generated ? { initial_password: generated } : {}) };
  }

  /**
   * Deletes an account with its tokens and access requests (cascade). Accounts that still own active
   * packages are refused, so no package is left without an owner; withdrawn ones keep their tombstone.
   */
  public async deleteUser(adminId: string, userId: string): Promise<void> {
    const knex = getDatabase();
    if (adminId === userId) {
      throw new Error('CONFLICT: Ihr eigenes Konto können Sie hier nicht löschen.');
    }
    const user = await knex('users').where({ id: userId }).first('id');
    if (!user) {
      throw new Error('NOT_FOUND: Konto nicht gefunden.');
    }
    const packages = await knex('packages').where({ owner_id: userId }).pluck('id');
    if (packages.length > 0) {
      throw new Error(`CONFLICT: Das Konto besitzt noch ${packages.length} aktive(s) Paket(e) (${packages.join(', ')}). Ziehen Sie diese zuerst zurück.`);
    }
    await knex('users').where({ id: userId }).del();
  }

  /** Sends a plain-text message from the Hub to an account; replies go to the admin. */
  public async emailUser(adminId: string, userId: string, subject: string, message: string): Promise<void> {
    const knex = getDatabase();
    const [admin, user] = await Promise.all([
      knex('users').where({ id: adminId }).first('email', 'full_name'),
      knex('users').where({ id: userId }).first('email'),
    ]);
    if (!user) {
      throw new Error('NOT_FOUND: Konto nicht gefunden.');
    }
    await EmailService.sendMessage({ to: user.email, replyTo: admin?.email, subject, text: message, senderName: admin?.full_name });
  }

  /**
   * Final deletion of a withdrawn package: removes its tombstone (and any leftovers), so the ID can be
   * used again and Moodles that imported it get 404 instead of 410. Active packages must be withdrawn first.
   */
  public async purgeWithdrawnPackage(packageId: string): Promise<void> {
    const knex = getDatabase();
    if (await knex('packages').where({ id: packageId }).first()) {
      throw new Error('CONFLICT: Das Paket ist noch aktiv. Ziehen Sie es zuerst zurück.');
    }
    if (!(await knex('withdrawn_packages').where({ id: packageId }).first())) {
      throw new Error('NOT_FOUND: Kein zurückgezogenes Paket mit dieser ID.');
    }
    await knex.transaction(async trx => {
      await trx('releases').where({ package_id: packageId }).del();
      await trx('withdrawn_packages').where({ id: packageId }).del();
    });
    await PackageStorageService.getInstance().removePackage(packageId);
  }
}
