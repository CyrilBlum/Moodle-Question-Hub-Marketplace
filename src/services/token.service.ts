import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { CryptoService } from './crypto.service';
import { UserPublicProfile } from '../types/user.types';

export class TokenService {
  private static instance: TokenService | null = null;

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  public async createToken(
    userId: string,
    name: string,
    expiresInDays?: number
  ): Promise<{
    id: string;
    name: string;
    token: string;
    token_prefix: string;
    expires_at: string | null;
  }> {
    const knex = getDatabase();
    const tokenId = crypto.randomUUID();
    const { rawToken, tokenPrefix, tokenHash } = CryptoService.generatePatToken();

    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    await knex('personal_access_tokens').insert({
      id: tokenId,
      user_id: userId,
      name: name.trim(),
      token_prefix: tokenPrefix,
      token_hash: tokenHash,
      last_used_at: null,
      expires_at: expiresAt,
      created_at: new Date(),
    });

    return {
      id: tokenId,
      name: name.trim(),
      token: rawToken,
      token_prefix: tokenPrefix,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  public async listTokens(userId: string): Promise<Array<{
    id: string;
    name: string;
    token_prefix: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
  }>> {
    const knex = getDatabase();
    const records = await knex('personal_access_tokens')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');

    return records.map(r => ({
      id: r.id,
      name: r.name,
      token_prefix: r.token_prefix,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
      last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      expires_at: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    }));
  }

  public async revokeToken(userId: string, tokenId: string): Promise<boolean> {
    const knex = getDatabase();
    const count = await knex('personal_access_tokens')
      .where({ id: tokenId, user_id: userId })
      .delete();

    return count > 0;
  }

  public async authenticatePat(rawToken: string): Promise<UserPublicProfile | null> {
    const knex = getDatabase();
    const tokenHash = CryptoService.hashPatToken(rawToken);

    const tokenRecord = await knex('personal_access_tokens')
      .where({ token_hash: tokenHash })
      .first();

    if (!tokenRecord) {
      return null;
    }

    // Check expiration
    if (tokenRecord.expires_at) {
      const expDate = new Date(tokenRecord.expires_at);
      if (expDate.getTime() < Date.now()) {
        return null;
      }
    }

    // Update last_used_at
    await knex('personal_access_tokens')
      .where({ id: tokenRecord.id })
      .update({ last_used_at: new Date() });

    const user = await knex('users').where({ id: tokenRecord.user_id }).first();
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      institution: user.institution,
      canton: user.canton,
      role: user.role,
    };
  }
}
