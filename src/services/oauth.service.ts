import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { CryptoService } from './crypto.service';
import { UserPublicProfile } from '../types/user.types';

export class OAuthService {
  private static instance: OAuthService | null = null;

  public static getInstance(): OAuthService {
    if (!OAuthService.instance) {
      OAuthService.instance = new OAuthService();
    }
    return OAuthService.instance;
  }

  public async validateClient(clientId: string, redirectUri: string): Promise<boolean> {
    const knex = getDatabase();
    const client = await knex('oauth_clients').where({ client_id: clientId }).first();
    if (!client) return false;

    try {
      const allowedUris: string[] = JSON.parse(client.redirect_uris);
      return allowedUris.some(uri => redirectUri.startsWith(uri) || uri === redirectUri);
    } catch {
      return client.redirect_uris === redirectUri;
    }
  }

  public async createAuthCode(data: {
    clientId: string;
    userId: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    redirectUri: string;
  }): Promise<string> {
    const knex = getDatabase();
    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes validity

    await knex('oauth_auth_codes').insert({
      code,
      client_id: data.clientId,
      user_id: data.userId,
      code_challenge: data.codeChallenge,
      code_challenge_method: data.codeChallengeMethod || 'S256',
      redirect_uri: data.redirectUri,
      used: false,
      expires_at: expiresAt,
      created_at: new Date(),
    });

    return code;
  }

  public async exchangeCode(data: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ user: UserPublicProfile }> {
    const knex = getDatabase();

    const record = await knex('oauth_auth_codes')
      .where({
        code: data.code,
        client_id: data.clientId,
        used: false,
      })
      .first();

    if (!record) {
      throw new Error('INVALID_GRANT: Autorisierungscode ist ungültig oder wurde bereits verwendet.');
    }

    // Check expiration
    if (new Date(record.expires_at).getTime() < Date.now()) {
      throw new Error('INVALID_GRANT: Autorisierungscode ist abgelaufen.');
    }

    // Check redirect_uri match
    if (record.redirect_uri !== data.redirectUri) {
      throw new Error('INVALID_GRANT: redirect_uri stimmt nicht mit dem Autorisierungsaufruf überein.');
    }

    // Verify PKCE
    const isValidChallenge = CryptoService.verifyPkce(
      data.codeVerifier,
      record.code_challenge,
      record.code_challenge_method
    );

    if (!isValidChallenge) {
      throw new Error('INVALID_GRANT: PKCE-Prüfung fehlgeschlagen: code_verifier stimmt nicht mit code_challenge überein.');
    }

    // Mark as used
    await knex('oauth_auth_codes')
      .where({ code: data.code })
      .update({ used: true });

    // Fetch user
    const user = await knex('users').where({ id: record.user_id }).first();
    if (!user) {
      throw new Error('SERVER_ERROR: Zugeordneter Benutzer wurde nicht gefunden.');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        institution: user.institution,
        canton: user.canton,
        role: user.role,
      },
    };
  }
}
