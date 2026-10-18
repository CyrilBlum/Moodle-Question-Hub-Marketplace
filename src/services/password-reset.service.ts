import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { CryptoService } from './crypto.service';

/** A reset link is valid this long and only once. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * "Password forgotten": a random one-time token is mailed as a link; only its SHA-256 hash is stored.
 * Requesting a new link invalidates older ones; setting the password invalidates all of the account's links.
 */
export class PasswordResetService {
  private static instance: PasswordResetService | null = null;

  public static getInstance(): PasswordResetService {
    if (!PasswordResetService.instance) PasswordResetService.instance = new PasswordResetService();
    return PasswordResetService.instance;
  }

  /** New token for the account with this e-mail address, or null when there is none (the caller answers the same either way). */
  public async createToken(email: string): Promise<{ token: string; user: { id: string; email: string; full_name: string } } | null> {
    const knex = getDatabase();
    const user = await knex('users').where({ email: email.trim().toLowerCase() }).first('id', 'email', 'full_name');
    if (!user) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    await knex.transaction(async trx => {
      await trx('password_resets').where({ user_id: user.id }).whereNull('used_at').del();
      await trx('password_resets').insert({
        id: crypto.randomUUID(), user_id: user.id, token_hash: hashToken(token),
        expires_at: new Date(now.getTime() + RESET_TOKEN_TTL_MS), created_at: now,
      });
    });
    return { token, user };
  }

  /** Whether a token can still be used (for the form, before the user types a new password). */
  public async isValid(token: string): Promise<boolean> {
    if (!token) return false;
    const row = await getDatabase()('password_resets').where({ token_hash: hashToken(token) }).whereNull('used_at').first('expires_at');
    return !!row && new Date(row.expires_at).getTime() > Date.now();
  }

  /** Sets the new password; throws BAD_REQUEST for an unknown, used or expired token. */
  public async resetPassword(token: string, password: string): Promise<void> {
    const knex = getDatabase();
    await knex.transaction(async trx => {
      const row = await trx('password_resets').where({ token_hash: hashToken(token || '') }).whereNull('used_at').first();
      if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
        throw new Error('BAD_REQUEST: Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen an.');
      }
      // Claim the token first, so the same link cannot be used twice in parallel.
      const claimed = await trx('password_resets').where({ id: row.id }).whereNull('used_at').update({ used_at: new Date() });
      if (claimed !== 1) throw new Error('BAD_REQUEST: Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen an.');
      await trx('users').where({ id: row.user_id }).update({ password_hash: CryptoService.hashPassword(password), updated_at: new Date() });
      await trx('password_resets').where({ user_id: row.user_id }).whereNull('used_at').del();
    });
  }
}
