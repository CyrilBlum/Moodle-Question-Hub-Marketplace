import { getDatabase } from '../database/connection';
import { CryptoService } from './crypto.service';
import { PackageService } from './package.service';

/** Owner of tombstones whose account was deleted: keeps the ID reserved without pointing to a person. */
export const DELETED_OWNER = 'deleted';

export interface AccountDeletionPlan {
  /** Own packages without another package admin: withdrawn with all versions and files. */
  withdraw: Array<{ id: string; title: string }>;
  /** Own packages with another package admin: that person becomes the owner. */
  transfer: Array<{ id: string; title: string; new_owner_name: string }>;
  /** The last Hub admin cannot delete the own account. */
  blocked_reason: string | null;
}

/** Self-service deletion of an account and all personal data the Hub holds about it. */
export class AccountService {
  private static instance: AccountService;

  public static getInstance(): AccountService {
    if (!AccountService.instance) {
      AccountService.instance = new AccountService();
    }
    return AccountService.instance;
  }

  public async deletionPlan(userId: string): Promise<AccountDeletionPlan> {
    const knex = getDatabase();
    const user = await knex('users').where({ id: userId }).first('role');
    if (!user) throw new Error('NOT_FOUND: Konto nicht gefunden.');

    let blocked_reason: string | null = null;
    if (user.role === 'admin') {
      const admins = await knex('users').where({ role: 'admin' }).count<{ n: number }[]>({ n: '*' });
      if (Number(admins[0]?.n) <= 1) {
        blocked_reason = 'Sie sind die einzige Admin-Person des Hubs. Ernennen Sie zuerst eine weitere Person zur Admin.';
      }
    }

    const plan: AccountDeletionPlan = { withdraw: [], transfer: [], blocked_reason };
    const owned = await knex('packages').where({ owner_id: userId }).orderBy('title').select('id', 'title');
    for (const pkg of owned) {
      const heir = await this.heirOf(pkg.id, userId);
      if (heir) plan.transfer.push({ id: pkg.id, title: pkg.title, new_owner_name: heir.full_name });
      else plan.withdraw.push({ id: pkg.id, title: pkg.title });
    }
    return plan;
  }

  /**
   * Deletes the account after checking its password. Own packages pass to another package admin or are
   * withdrawn; tokens, memberships, access requests and approvals go with the account (cascade), merge
   * requests and comments stay without author. Tombstones keep their ID reserved but lose the owner, so
   * nobody can take over the ID of a package that Moodles still link to.
   */
  public async deleteAccount(userId: string, password: string): Promise<void> {
    const knex = getDatabase();
    const user = await knex('users').where({ id: userId }).first('password_hash');
    if (!user) throw new Error('NOT_FOUND: Konto nicht gefunden.');
    if (!CryptoService.verifyPassword(password, user.password_hash)) {
      throw new Error('UNAUTHORIZED: Das Passwort ist falsch.');
    }
    const plan = await this.deletionPlan(userId);
    if (plan.blocked_reason) throw new Error(`CONFLICT: ${plan.blocked_reason}`);

    for (const pkg of plan.transfer) {
      const heir = await this.heirOf(pkg.id, userId);
      if (!heir) {
        plan.withdraw.push(pkg);
        continue;
      }
      await knex.transaction(async trx => {
        // The heir becomes the creator, who is admin by ownership and needs no member row.
        await trx('package_members').where({ package_id: pkg.id, user_id: heir.id }).del();
        await trx('packages').where({ id: pkg.id }).update({ owner_id: heir.id, updated_at: new Date() });
      });
    }
    const packages = PackageService.getInstance();
    for (const pkg of plan.withdraw) {
      await packages.withdrawPackage(userId, pkg.id);
    }

    await knex.transaction(async trx => {
      // A GitHub mirror pushes with the linking person's token, which is deleted with the account.
      await trx('packages').where({ github_linked_by: userId }).update({ github_repo: null, github_linked_by: null });
      await trx('merge_requests').where({ closed_by: userId }).update({ closed_by: null });
      await trx('withdrawn_packages').where({ owner_id: userId }).update({ owner_id: DELETED_OWNER });
      await trx('users').where({ id: userId }).del();
    });
  }

  /** The longest-standing other admin of a package, or undefined. */
  private async heirOf(packageId: string, userId: string): Promise<{ id: string; full_name: string } | undefined> {
    return getDatabase()('package_members')
      .join('users', 'users.id', 'package_members.user_id')
      .where({ 'package_members.package_id': packageId, 'package_members.role': 'admin' })
      .whereNot('package_members.user_id', userId)
      .orderBy('package_members.created_at')
      .first('users.id', 'users.full_name');
  }
}
