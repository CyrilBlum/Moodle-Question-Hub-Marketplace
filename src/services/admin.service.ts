import { getDatabase } from '../database/connection';
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

  public async overview(): Promise<{ users: AdminUserSummary[]; withdrawn: AdminWithdrawnPackage[] }> {
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
    };
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
