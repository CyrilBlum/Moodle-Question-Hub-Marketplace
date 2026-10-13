import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CryptoService } from '../../src/services/crypto.service';

describe('Crypto & Token Service Unit Tests', () => {
  it('correctly hashes and verifies passwords using scrypt with random salt', () => {
    const password = 'GymnasialLehrer2026!';
    const hash = CryptoService.hashPassword(password);

    expect(hash).toContain(':');
    expect(CryptoService.verifyPassword(password, hash)).toBe(true);
    expect(CryptoService.verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('generates Personal Access Tokens with standard mqh_pat_ prefix and SHA-256 hash', () => {
    const { rawToken, tokenPrefix, tokenHash } = CryptoService.generatePatToken();

    expect(rawToken.startsWith('mqh_pat_')).toBe(true);
    expect(tokenPrefix.startsWith('mqh_pat_')).toBe(true);
    expect(tokenHash).toHaveLength(64);

    const rehashed = CryptoService.hashPatToken(rawToken);
    expect(rehashed).toBe(tokenHash);
  });

  it('verifies RFC 7636 PKCE code_verifier against code_challenge', () => {
    // Standard RFC 7636 test vector
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const isValid = CryptoService.verifyPkce(verifier, expectedChallenge, 'S256');
    expect(isValid).toBe(true);

    const isInvalid = CryptoService.verifyPkce('wrong_verifier', expectedChallenge, 'S256');
    expect(isInvalid).toBe(false);
  });
});
