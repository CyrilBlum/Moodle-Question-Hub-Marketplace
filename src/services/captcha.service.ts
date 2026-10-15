import crypto from 'crypto';
import { getConfig } from '../config';

/**
 * Self-hosted proof-of-work captcha in the ALTCHA format (https://altcha.org, MIT), verified with node:crypto.
 * The browser widget searches the number n with SHA-256(salt + n) = challenge; the HMAC signature proves the
 * challenge came from this server. No third party is contacted and no cookie is set.
 */
export interface CaptchaChallenge {
  algorithm: 'SHA-256';
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

const MAX_NUMBER = 200_000;
const VALID_MINUTES = 10;

export class CaptchaService {
  /** Signatures of solved challenges until they expire, so a solution cannot be used twice (single process). */
  private static used = new Map<string, number>();

  public static isEnabled(): boolean {
    return getConfig().CAPTCHA_ENABLED;
  }

  private static key(): string {
    const config = getConfig();
    return config.CAPTCHA_HMAC_KEY
      || crypto.createHmac('sha256', config.JWT_SECRET).update('altcha-captcha').digest('hex');
  }

  private static sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private static sign(challenge: string): string {
    return crypto.createHmac('sha256', this.key()).update(challenge).digest('hex');
  }

  public static createChallenge(): CaptchaChallenge {
    const expires = Math.floor(Date.now() / 1000) + VALID_MINUTES * 60;
    // Same salt layout as altcha-lib: random part, parameters, and '&' against parameter splicing.
    const salt = `${crypto.randomBytes(12).toString('hex')}?expires=${expires}&`;
    const challenge = this.sha256(salt + crypto.randomInt(MAX_NUMBER));
    return { algorithm: 'SHA-256', challenge, maxnumber: MAX_NUMBER, salt, signature: this.sign(challenge) };
  }

  /** Checks a base64 JSON payload from the widget: signature, solution, expiry and one-time use. */
  public static verify(payload: unknown): boolean {
    if (typeof payload !== 'string' || payload.length > 2000) return false;
    let data: any;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch {
      return false;
    }
    if (data?.algorithm !== 'SHA-256' || typeof data.salt !== 'string' || typeof data.challenge !== 'string'
      || typeof data.signature !== 'string' || !Number.isInteger(data.number)) {
      return false;
    }
    const expires = Number(new URLSearchParams(data.salt.split('?')[1] || '').get('expires'));
    const now = Math.floor(Date.now() / 1000);
    if (!expires || expires < now) return false;

    const expected = this.sign(data.challenge);
    if (expected.length !== data.signature.length
      || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(data.signature))) {
      return false;
    }
    if (this.sha256(data.salt + data.number) !== data.challenge) return false;

    for (const [signature, until] of this.used) {
      if (until < now) this.used.delete(signature);
    }
    if (this.used.has(data.signature)) return false;
    this.used.set(data.signature, expires);
    return true;
  }
}
