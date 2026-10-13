import crypto from 'crypto';

export class CryptoService {
  /**
   * Hashes a password using PBKDF2/scrypt with a unique random salt.
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verifies a candidate password against the stored salt:hash string.
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) {
      return false;
    }
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  /**
   * Generates a Personal Access Token (PAT).
   * Format: mqh_pat_<64 hex chars>
   */
  public static generatePatToken(): { rawToken: string; tokenPrefix: string; tokenHash: string } {
    const randomHex = crypto.randomBytes(32).toString('hex');
    const rawToken = `mqh_pat_${randomHex}`;
    const tokenPrefix = `mqh_pat_${randomHex.substring(0, 8)}...`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenPrefix, tokenHash };
  }

  /**
   * Hashes a PAT token for database lookup.
   */
  public static hashPatToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Computes SHA-256 hash of a string or buffer.
   */
  public static sha256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Base64URL encoding without padding.
   */
  public static base64UrlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Verifies PKCE code_verifier against code_challenge (S256).
   */
  public static verifyPkce(codeVerifier: string, codeChallenge: string, method: string = 'S256'): boolean {
    if (method !== 'S256') {
      return false;
    }
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const calculatedChallenge = this.base64UrlEncode(hash);
    return calculatedChallenge === codeChallenge;
  }
}
