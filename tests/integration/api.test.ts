import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import { runMigrations } from '../../src/database/migrate';
import { runSeeds } from '../../src/database/seed';
import { closeDatabase, getDatabase } from '../../src/database/connection';
import { CryptoService } from '../../src/services/crypto.service';
import { PackageMembersService } from '../../src/services/package-members.service';

describe('Marketplace REST API Endpoints Integration Tests', () => {
  let app: FastifyInstance;
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  let teacherJwtToken: string;
  let patToken: string;
  let patId: string;

  /** Solves a captcha challenge the way the browser widget does (proof of work, ALTCHA format). */
  const captcha = async (): Promise<string> => {
    const c = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/captcha' })).body);
    for (let n = 0; n <= c.maxnumber; n++) {
      if (crypto.createHash('sha256').update(c.salt + n).digest('hex') === c.challenge) {
        return Buffer.from(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature })).toString('base64');
      }
    }
    throw new Error('Captcha challenge not solvable');
  };

  beforeAll(async () => {
    process.env.SEED_TEACHER_PASSWORD = 'integration-test-only-pw';
    // Run DB migrations and seed
    await runMigrations();
    await runSeeds();
    // A persistent local test DB may already contain the user from an earlier seed: pin the test password.
    await getDatabase()('users')
      .where({ email: 'teacher@kanti.ch' })
      .update({ password_hash: CryptoService.hashPassword(process.env.SEED_TEACHER_PASSWORD as string) });

    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  // 1. GET /api/v1/health
  it('GET /api/v1/health returns status ok with db and storage status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database.status).toBe('connected');
    expect(body.monetisation.enabled).toBe(false);
  });

  // 2. GET /api/v1/taxonomy
  it('GET /api/v1/taxonomy returns Swiss Gymnasium curriculum taxonomy', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/taxonomy',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.framework).toBe('CH-EDK-RLP');
    expect(body.subjects.length).toBeGreaterThanOrEqual(15);
  });

  // 3. POST /api/v1/auth/register & /login
  it('POST /api/v1/auth/register registers teacher and returns token', async () => {
    const testEmail = `teacher_${Date.now()}@kanti.ch`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        altcha: await captcha(),
        email: testEmail,
        password: 'SecureTeacherPassword2026!',
        full_name: 'Dr. Beat Meier',
        institution: 'Kantonsschule Zürich Nord',
        canton: 'ZH',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe(testEmail);
    expect(body.token).toBeDefined();

    teacherJwtToken = body.token;
  });

  it('POST /api/v1/auth/login logs in existing teacher', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        altcha: await captcha(),
        email: 'teacher@kanti.ch',
        password: 'integration-test-only-pw',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('teacher@kanti.ch');

    // Without a solved captcha, with a forged one, or with a used one, login and registration are refused.
    const credentials = { email: 'teacher@kanti.ch', password: 'integration-test-only-pw' };
    const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: credentials });
    expect(missing.statusCode).toBe(400);
    expect(JSON.parse(missing.body).code).toBe('CAPTCHA_FAILED');
    const solved = await captcha();
    const forged = JSON.parse(Buffer.from(solved, 'base64').toString());
    forged.number += 1;
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login',
      payload: { ...credentials, altcha: Buffer.from(JSON.stringify(forged)).toString('base64') } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { ...credentials, altcha: solved } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { ...credentials, altcha: solved } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register',
      payload: { email: `nocaptcha-${Date.now()}@example.ch`, password: 'No-Captcha-123!', full_name: 'Ohne Captcha', institution: 'Kanti X', canton: 'ZH' } })).statusCode).toBe(400);
    expect(body.token).toBeDefined();
  });

  // 4. GET /api/v1/auth/me
  it('GET /api/v1/auth/me retrieves authenticated user profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.full_name).toBe('Dr. Beat Meier');
  });

  // 5. POST & GET /api/v1/account/tokens
  it('POST /api/v1/account/tokens creates a new Personal Access Token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/account/tokens',
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
      payload: {
        name: 'Moodle KZN Testserver',
        expires_in_days: 365,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token.startsWith('mqh_pat_')).toBe(true);
    expect(body.token_prefix).toBeDefined();

    patToken = body.token;
    patId = body.id;
  });

  it('GET /api/v1/account/tokens lists active tokens for user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/tokens',
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((t: any) => t.id === patId)).toBe(true);
  });

  // 6. POST /api/v1/packages/preflight
  it('POST /api/v1/packages/preflight validates XML package without publishing', async () => {
    const validXml = fs.readFileSync(path.join(fixturesDir, 'valid-gym-datenstrukturen.xml'), 'utf-8');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packages/preflight',
      headers: {
        authorization: `Bearer ${patToken}`, // Authenticating via PAT!
      },
      payload: {
        xml: validXml,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body.can_publish).toBe(true);
    expect(body.stats.question_count).toBe(7);
  });

  it('POST /api/v1/packages/preflight flags blocking errors on XXE attacks', async () => {
    const xxeXml = fs.readFileSync(path.join(fixturesDir, 'attack-xxe-passwd.xml'), 'utf-8');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packages/preflight',
      headers: {
        authorization: `Bearer ${patToken}`,
      },
      payload: {
        xml: xxeXml,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.can_publish).toBe(false);
    expect(body.diagnostics.errors.some((e: any) => e.code === 'ERR_XXE_DOCTYPE_FORBIDDEN')).toBe(true);
  });

  // 7. POST /api/v1/packages (Publish)
  const testPkgId = `ch.gym.inf.datenstrukturen.${Date.now()}`;
  const validXml = fs.readFileSync(path.join(fixturesDir, 'valid-gym-datenstrukturen.xml'), 'utf-8');

  it('POST /api/v1/packages publishes a new question package release', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packages',
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
      payload: {
        metadata: {
          id: testPkgId,
          version: '1.0.0',
          title: 'Datenstrukturen: Bäume und Graphen',
          summary: 'Aufgabensammlung zu binären Suchbäumen und Graphenalgorithmen.',
          language: 'de-CH',
          license: 'CC-BY-4.0',
          taxonomy: {
            framework: 'CH-EDK-RLP',
            canton: 'ZH',
            level: 'GYM_SEK_II',
            grades: ['GYM2', 'GYM3'],
            subject_category: 'SF',
            subject: 'Informatik',
            topic: 'Algorithmen & Datenstrukturen',
            tags: ['Bäume', 'Graphen', 'Traversierung'],
          },
          release_notes: 'Initial community release.',
        },
        xml: validXml,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.package_id).toBe(testPkgId);
    expect(body.version).toBe('1.0.0');
    expect(body.sha256).toBeDefined();
    expect(body.question_count).toBe(7);
  });

  // 8. Monotonic SemVer Enforcement
  it('enforces SemVer monotonicity: republishing version 1.0.0 returns 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packages',
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
      payload: {
        metadata: {
          id: testPkgId,
          version: '1.0.0', // Same version!
          title: 'Datenstrukturen v1.0.0',
          summary: 'Duplikat',
          language: 'de-CH',
          license: 'CC-BY-4.0',
          taxonomy: {
            subject: 'Informatik',
            subject_category: 'SF',
          },
        },
        xml: validXml,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('existiert bereits oder ist nicht höher');
  });

  it('allows publishing incremented SemVer 1.1.0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packages',
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
      payload: {
        metadata: {
          id: testPkgId,
          version: '1.1.0', // Higher version
          title: 'Datenstrukturen: Bäume und Graphen (v1.1.0)',
          summary: 'Zwei Verbesserungen im Text.',
          language: 'de-CH',
          license: 'CC-BY-4.0',
          taxonomy: {
            subject: 'Informatik',
            subject_category: 'SF',
          },
          release_notes: 'Version 1.1.0 Update',
        },
        xml: validXml,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.version).toBe('1.1.0');
  });

  // 9. GET /api/v1/packages (Search & Filters)
  it('GET /api/v1/packages searches and filters packages', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/packages?subject=Informatik&level=SF`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((p: any) => p.id === testPkgId)).toBe(true);
  });

  // 10. GET /api/v1/packages/:id
  it('GET /api/v1/packages/:id returns package details and release history', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/packages/${testPkgId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(testPkgId);
    expect(body.latest_version).toBe('1.1.0');
    expect(body.releases.length).toBe(2);
  });

  // 11. GET /api/v1/packages/:id/preview
  it('GET /api/v1/packages/:id/preview returns sanitized preview without answer keys', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/packages/${testPkgId}/preview`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.packageId).toBe(testPkgId);
    expect(body.questions.length).toBeGreaterThan(0);

    const jsonStr = JSON.stringify(body);
    expect(jsonStr).not.toContain('"fraction"');
    expect(jsonStr).not.toContain('Korrekt!');
  });

  // 12. GET /api/v1/packages/:id/releases/:version/download
  it('GET /api/v1/packages/:id/releases/:version/download streams XML file with headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/packages/${testPkgId}/releases/1.1.0/download`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.body).toContain('<quiz>');
  });

  // 13. DELETE /api/v1/account/tokens/:id
  it('DELETE /api/v1/account/tokens/:id revokes personal access token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/account/tokens/${patId}`,
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
      },
    });

    expect(res.statusCode).toBe(204);
  });

  // 14. OAuth 2.0 PKCE Flow
  it('executes complete RFC 7636 PKCE OAuth authorization code flow', async () => {
    const verifier = 'random_verifier_string_must_be_sufficiently_long_for_pkce_12345';
    const challenge = CryptoService.base64UrlEncode(
      require('crypto').createHash('sha256').update(verifier).digest()
    );

    // Step 1: GET /oauth/authorize
    const authRes = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?client_id=moodle-plugin-client&redirect_uri=https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=csrf123`,
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
        accept: 'application/json',
      },
    });

    expect(authRes.statusCode).toBe(200);
    const authBody = JSON.parse(authRes.body);
    expect(authBody.code).toBeDefined();

    const code = authBody.code;

    // Step 2: POST /oauth/token
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'authorization_code',
        code,
        client_id: 'moodle-plugin-client',
        redirect_uri: 'https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php',
        code_verifier: verifier,
      },
    });

    expect(tokenRes.statusCode).toBe(200);
    const tokenBody = JSON.parse(tokenRes.body);
    expect(tokenBody.access_token).toBeDefined();
    expect(tokenBody.token_type).toBe('Bearer');
    expect(tokenBody.user).toBeDefined();
  });

  it('executes PKCE OAuth flow via /api/v1/oauth alias endpoints', async () => {
    const verifier = 'alias_test_verifier_string_at_least_43_chars_long_1234567890';
    const challenge = CryptoService.base64UrlEncode(
      require('crypto').createHash('sha256').update(verifier).digest()
    );

    // Step 1: GET /api/v1/oauth/authorize
    const authRes = await app.inject({
      method: 'GET',
      url: `/api/v1/oauth/authorize?client_id=moodle-plugin-client&redirect_uri=${encodeURIComponent(
        'https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php'
      )}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`,
      headers: {
        authorization: `Bearer ${teacherJwtToken}`,
        accept: 'application/json',
      },
    });

    expect(authRes.statusCode).toBe(200);
    const authBody = JSON.parse(authRes.body);
    expect(authBody.code).toBeDefined();

    // Step 2: POST /api/v1/oauth/token
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/oauth/token',
      payload: {
        grant_type: 'authorization_code',
        code: authBody.code,
        client_id: 'moodle-plugin-client',
        redirect_uri: 'https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php',
        code_verifier: verifier,
      },
    });

    expect(tokenRes.statusCode).toBe(200);
    const tokenBody = JSON.parse(tokenRes.body);
    expect(tokenBody.access_token).toBeDefined();
    expect(tokenBody.token_type).toBe('Bearer');
    expect(tokenBody.user).toBeDefined();
  });

  // 15. OAuth requires a real login (no fallback user)
  it('OAuth authorize without login redirects browsers to /connect and rejects API calls', async () => {
    const url =
      '/oauth/authorize?client_id=moodle-plugin-client&redirect_uri=' +
      encodeURIComponent('https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php') +
      '&response_type=code&code_challenge=abc&code_challenge_method=S256&state=s1';

    const browser = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } });
    expect(browser.statusCode).toBe(302);
    expect(String(browser.headers.location)).toMatch(/^\/connect\?/);
    expect(String(browser.headers.location)).not.toContain('code=');

    const api = await app.inject({ method: 'GET', url, headers: { accept: 'application/json' } });
    expect(api.statusCode).toBe(401);
  });

  it('OAuth authorize with missing parameters shows a friendly page for browsers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(302);
    expect(String(res.headers.location)).toMatch(/^\/connect\?error=/);
  });

  // 16. Preview switch and withdrawal
  // Withdrawn IDs stay reserved, so a persistent test database needs a fresh ID per run.
  const lifecycleId = `ch.gym.inf.lifecycle-test-${Date.now()}`;
  const publishLifecycle = (version: string, extra: object = {}, token = teacherJwtToken) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/packages',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        metadata: {
          id: lifecycleId,
          version,
          title: 'Lifecycle & Test',
          summary: 'Paket fuer Vorschau- und Rueckzugstests.',
          language: 'de-CH',
          license: 'CC-BY-4.0',
          taxonomy: { subject: 'Informatik', subject_category: 'SF' },
          ...extra,
        },
        xml: validXml,
      },
    });

  it('preview_enabled=false hides the preview; default is enabled', async () => {
    const res = await publishLifecycle('1.0.0', { preview_enabled: false, title: 'Lifecycle &amp; Test' });
    expect(res.statusCode).toBe(201);
    const titled = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` })).body);
    expect(titled.title).toBe('Lifecycle & Test');

    const detail = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` })).body);
    expect(detail.preview_enabled).toBe(false);

    const prev = await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}/preview` });
    expect(prev.statusCode).toBe(403);
    expect(JSON.parse(prev.body).code).toBe('PREVIEW_DISABLED');

    const other = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${testPkgId}` })).body);
    expect(other.preview_enabled).toBe(true);

    // Next release without the field keeps the setting; explicit true re-enables it.
    expect((await publishLifecycle('1.1.0')).statusCode).toBe(201);
    const kept = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` })).body);
    expect(kept.preview_enabled).toBe(false);
    expect((await publishLifecycle('1.2.0', { preview_enabled: true })).statusCode).toBe(201);

    // An update built on an older release is refused until the client has pulled the latest one.
    const stale = await publishLifecycle('1.3.0', { base_version: '1.1.0' });
    expect(stale.statusCode).toBe(409);
    expect(JSON.parse(stale.body).message).toContain('im Hub ist bereits Version 1.2.0');
    const on = await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}/preview` });
    expect(on.statusCode).toBe(200);
  });

  it('only the owner can withdraw; a withdrawn version stays blocked; last version needs package withdrawal', async () => {
    const auth = { authorization: `Bearer ${teacherJwtToken}` };

    const strangerReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        altcha: await captcha(),
        email: `stranger-${Date.now()}@example.ch`,
        password: 'Stranger-Pass-123!',
        full_name: 'Fremde Person',
        institution: 'Kanti X',
        canton: 'ZH',
      },
    });
    const stranger = JSON.parse(strangerReg.body).token;
    const denied = await app.inject({
      method: 'DELETE',
      url: `/api/v1/packages/${lifecycleId}`,
      headers: { authorization: `Bearer ${stranger}` },
    });
    expect(denied.statusCode).toBe(403);

    const mine = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/account/packages', headers: auth })).body);
    expect(mine.data.some((p: any) => p.id === lifecycleId)).toBe(true);

    // withdraw latest (1.2.0): latest falls back to 1.1.0, download gone, version number stays blocked
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/v1/packages/${lifecycleId}/releases/1.2.0`, headers: auth }))
        .statusCode
    ).toBe(204);
    const detail = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` })).body);
    expect(detail.latest_version).toBe('1.1.0');
    expect(detail.versions).not.toContain('1.2.0');
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}/releases/1.2.0/download` })).statusCode
    ).toBe(404);
    expect((await publishLifecycle('1.2.0')).statusCode).toBe(409);

    // withdraw 1.0.0, then the last remaining version is refused
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/v1/packages/${lifecycleId}/releases/1.0.0`, headers: auth }))
        .statusCode
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/v1/packages/${lifecycleId}/releases/1.1.0`, headers: auth }))
        .statusCode
    ).toBe(409);

    // withdraw the whole package
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/v1/packages/${lifecycleId}`, headers: auth })).statusCode
    ).toBe(204);
    const gone = await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` });
    expect(gone.statusCode).toBe(410);
    expect(JSON.parse(gone.body).code).toBe('PACKAGE_WITHDRAWN');
    expect(JSON.parse(gone.body).last_version).toBe('1.2.0');
    expect((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}/preview` })).statusCode).toBe(410);
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}/releases/1.1.0/download` })).statusCode
    ).toBe(410);
    expect((await app.inject({ method: 'GET', url: '/api/v1/packages/ch.gym.inf.never-published' })).statusCode).toBe(404);

    // The ID stays reserved: other accounts are refused, the owner may continue above the last version.
    expect((await publishLifecycle('2.0.0', {}, stranger)).statusCode).toBe(409);
    expect((await publishLifecycle('1.2.0')).statusCode).toBe(409);
    expect((await publishLifecycle('1.3.0')).statusCode).toBe(201);
    expect((await publishLifecycle('1.4.0', { base_version: '1.3.0' })).statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` })).statusCode).toBe(200);
    await app.inject({ method: 'DELETE', url: `/api/v1/packages/${lifecycleId}`, headers: auth });
  });

  it('PATCH /packages/:id edits settings for the owner only and refuses version changes', async () => {
    const id = `ch.gym.inf.patch-test-${Date.now()}`;
    const auth = { authorization: `Bearer ${teacherJwtToken}` };
    const pub = await app.inject({
      method: 'POST',
      url: '/api/v1/packages',
      headers: auth,
      payload: {
        metadata: {
          id, version: '1.0.0', title: 'Patch Test', summary: 'Vorher', language: 'de-CH', license: 'CC-BY-4.0',
          taxonomy: { subject: 'Informatik', subject_category: 'SF', grades: ['GYM2'] },
        },
        xml: fs.readFileSync(path.join(fixturesDir, 'valid-gym-datenstrukturen.xml'), 'utf-8'),
      },
    });
    expect(pub.statusCode).toBe(201);

    const ok = await app.inject({
      method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth,
      payload: { title: 'Neuer &amp; Titel', summary: 'Nachher', license: 'CC0-1.0', grades: ['GYM3', 'GYM4'], tags: ['a', 'b'], preview_enabled: false },
    });
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body);
    expect(body.title).toBe('Neuer & Titel');
    expect(body.license).toBe('CC0-1.0');
    expect(body.taxonomy.grades.sort()).toEqual(['GYM3', 'GYM4']);
    expect(body.preview_enabled).toBe(false);

    expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth, payload: { version: '9.9.9' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth, payload: { license: 'MIT' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, payload: { title: 'x' } })).statusCode).toBe(401);

    await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}`, headers: auth });
  });

  it('accepts JSON publish bodies larger than 1 MiB (whole-category packages)', async () => {
    const padding = 'a'.repeat(3 * 1024 * 1024);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><quiz>
      <question type="category"><category><text>$course$/top/Gross</text></category></question>
      <question type="shortanswer"><name><text>Gross</text></name>
      <questiontext format="html"><text><![CDATA[<p>${padding}</p>]]></text></questiontext>
      <answer fraction="100"><text>x</text></answer></question></quiz>`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packages/preflight',
      headers: { authorization: `Bearer ${teacherJwtToken}` },
      payload: { xml },
    });
    expect(res.statusCode).not.toBe(413);
    expect(res.statusCode).toBe(200);
  });

  it('access requests keep the note, hide contact details without consent, and store the reply', async () => {
    const auth = { authorization: `Bearer ${teacherJwtToken}` };
    const knex = getDatabase();
    await knex('packages').where({ id: testPkgId }).update({ visibility: 'private' });
    const requester = JSON.parse((await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { altcha: await captcha(), email: `requester-${Date.now()}@example.ch`, password: 'Requester-Pass-123!', full_name: 'Anna Anfrage', institution: 'Kanti Z', canton: 'LU' },
    })).body);
    const requesterAuth = { authorization: `Bearer ${requester.token}` };
    try {
      // Without SMTP the request is refused before anything is stored.
      const refused = await app.inject({ method: 'POST', url: `/api/v1/packages/${testPkgId}/access-requests`, headers: requesterAuth,
        payload: { message: 'Bitte', share_contact: false } });
      expect(refused.statusCode).toBe(503);
      expect(await knex('package_access_requests').where({ requester_id: requester.user.id }).first()).toBeUndefined();
      expect((await app.inject({ method: 'POST', url: `/api/v1/packages/${testPkgId}/access-requests`, headers: requesterAuth,
        payload: { message: 'x'.repeat(2001) } })).statusCode).toBe(400);

      const requestId = 'test-access-request-1';
      await knex('package_access_requests').insert({
        id: requestId, package_id: testPkgId, requester_id: requester.user.id, status: 'pending',
        message: 'Für das Ergänzungsfach', share_contact: false, created_at: new Date(), updated_at: new Date(),
      });
      const list = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/account/packages/${testPkgId}/access-requests`, headers: auth })).body).data;
      const row = list.find((r: any) => r.id === requestId);
      expect(row.message).toBe('Für das Ergänzungsfach');
      expect(row.share_contact).toBe(false);
      expect(row.requester.name).toBe('Anna Anfrage');
      expect(row.requester.email).toBeNull();
      expect(row.requester.institution).toBeNull();
      expect((await app.inject({ method: 'GET', url: `/api/v1/account/packages/${testPkgId}/access-requests`, headers: requesterAuth })).statusCode).toBe(403);

      // Only the owner decides; the decision is stored even if no e-mail can be sent.
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${testPkgId}/access-requests/${requestId}`, headers: requesterAuth,
        payload: { status: 'approved' } })).statusCode).toBe(403);
      const decided = await app.inject({ method: 'PATCH', url: `/api/v1/packages/${testPkgId}/access-requests/${requestId}`, headers: auth,
        payload: { status: 'approved', message: '  Gerne, viel Erfolg!  ' } });
      expect(decided.statusCode).toBe(200);
      expect(JSON.parse(decided.body)).toEqual({ status: 'approved', notification_sent: false });
      const stored = await knex('package_access_requests').where({ id: requestId }).first();
      expect(stored.status).toBe('approved');
      expect(stored.response_message).toBe('Gerne, viel Erfolg!');
      const visible = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${testPkgId}`, headers: requesterAuth })).body);
      expect(visible.can_access).toBe(true);
    } finally {
      await knex('package_access_requests').where({ requester_id: requester.user.id }).del();
      await knex('users').where({ id: requester.user.id }).del();
      await knex('packages').where({ id: testPkgId }).update({ visibility: 'public' });
    }
  });

  it('package members: members read, editors publish versions, admins manage the package', async () => {
    const ownerAuth = { authorization: `Bearer ${teacherJwtToken}` };
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ownerAuth })).body);
    const id = `ch.gym.inf.members-test-${Date.now()}`;
    const publish = (version: string, token: string, extra: object = {}) => app.inject({
      method: 'POST', url: '/api/v1/packages', headers: { authorization: `Bearer ${token}` },
      payload: {
        metadata: {
          id, version, title: 'Mitwirkende Test', summary: 'Paket fuer Rollentests.', language: 'de-CH', license: 'CC-BY-4.0',
          taxonomy: { subject: 'Informatik', subject_category: 'SF' }, visibility: 'private', ...extra,
        },
        xml: validXml,
      },
    });
    const register = async (name: string) => JSON.parse((await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { altcha: await captcha(), email: `${name}-${Date.now()}@example.ch`, password: 'Members-Pass-123!', full_name: `Person ${name}`, institution: 'Kanti M', canton: 'BE' },
    })).body);
    const detail = async (auth: object) => JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}`, headers: auth })).body);

    expect((await publish('1.0.0', teacherJwtToken)).statusCode).toBe(201);
    const editor = await register('editor');
    const reader = await register('reader');
    const editorAuth = { authorization: `Bearer ${editor.token}` };
    const readerAuth = { authorization: `Bearer ${reader.token}` };
    try {
      // Without a role: no publishing and no access to the private package.
      expect((await publish('1.1.0', editor.token)).statusCode).toBe(403);
      expect((await detail(readerAuth)).can_access).toBe(false);

      // Only package admins add people, by the e-mail of an existing account.
      const add = (auth: object, email: string, role: string) =>
        app.inject({ method: 'POST', url: `/api/v1/packages/${id}/members`, headers: auth, payload: { email, role } });
      expect((await add(editorAuth, reader.user.email, 'member')).statusCode).toBe(403);
      expect((await add(ownerAuth, editor.user.email, 'editor')).statusCode).toBe(201);
      expect((await add(ownerAuth, reader.user.email.toUpperCase(), 'member')).statusCode).toBe(201);
      expect((await add(ownerAuth, 'niemand@example.ch', 'member')).statusCode).toBe(404);
      expect((await add(ownerAuth, reader.user.email, 'owner')).statusCode).toBe(400);

      // Everyone with a role sees the members; e-mail addresses only the admins.
      const seenByReader = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}/members`, headers: readerAuth })).body);
      expect(seenByReader.can_manage).toBe(false);
      expect(seenByReader.members.map((m: any) => m.role)).toEqual(['admin', 'editor', 'member']);
      expect(seenByReader.members[0]).toMatchObject({ user_id: me.id, is_creator: true });
      expect(seenByReader.members.every((m: any) => m.email === null)).toBe(true);
      const seenByOwner = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}/members`, headers: ownerAuth })).body);
      expect(seenByOwner.members[1].email).toBe(editor.user.email);

      // Members read the private package but cannot publish.
      expect(await detail(readerAuth)).toMatchObject({ can_access: true, my_role: 'member', can_manage: false });
      expect((await publish('1.1.0', reader.token)).statusCode).toBe(403);

      // Editors publish new versions; the package settings stay unchanged and stay with the admins.
      expect((await publish('1.1.0', editor.token, { title: 'Vom Editor geaendert', visibility: 'public' })).statusCode).toBe(201);
      expect(await detail(editorAuth)).toMatchObject({ title: 'Mitwirkende Test', visibility: 'private', latest_version: '1.1.0', my_role: 'editor' });
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: editorAuth, payload: { title: 'Neuer Titel' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}/releases/1.0.0`, headers: editorAuth })).statusCode).toBe(403);
      const editorPackages = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/account/packages', headers: editorAuth })).body).data;
      expect(editorPackages.find((p: any) => p.id === id)).toMatchObject({ my_role: 'editor', is_creator: false });
      const readerPackages = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/account/packages', headers: readerAuth })).body).data;
      expect(readerPackages.some((p: any) => p.id === id)).toBe(false);

      // Admins manage the package like the creator, who always stays admin.
      const setRole = (userId: string, role: string) =>
        app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}/members/${userId}`, headers: ownerAuth, payload: { role } });
      expect((await setRole(editor.user.id, 'admin')).statusCode).toBe(204);
      expect((await setRole(me.id, 'editor')).statusCode).toBe(409);
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: editorAuth, payload: { title: 'Neuer Titel' } })).statusCode).toBe(200);
      expect((await PackageMembersService.getInstance().counts()).get(id)).toEqual({ members: 1, editors: 0, admins: 2 });

      // Removing a member revokes the access; an admin may withdraw the package.
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}/members/${me.id}`, headers: editorAuth })).statusCode).toBe(409);
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}/members/${reader.user.id}`, headers: editorAuth })).statusCode).toBe(204);
      expect((await detail(readerAuth)).can_access).toBe(false);
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}`, headers: editorAuth })).statusCode).toBe(204);
      expect(await getDatabase()('package_members').where({ package_id: id }).first()).toBeUndefined();
    } finally {
      await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}`, headers: ownerAuth });
      await getDatabase()('users').whereIn('id', [editor.user.id, reader.user.id]).del();
    }
  });

  it('GitHub link: optional token, every release and a new link are committed with the release notes as message', async () => {
    const auth = { authorization: `Bearer ${teacherJwtToken}` };
    const id = `ch.gym.inf.github-test-${Date.now()}`;
    const ghToken = 'github_pat_integration_test_token_0123456789';
    const calls: Array<{ method: string; path: string; body: any }> = [];
    let failCommit = false;
    const repos = new Set(['questions']);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any = {}) => {
      const url = new URL(String(input));
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      if (init.headers?.Authorization !== `Bearer ${ghToken}`) return json(401, { message: 'Bad credentials' });
      if (url.pathname === '/user') return json(200, { login: 'octo' });
      if (url.pathname === '/user/repos' && method === 'POST') {
        repos.add(body.name);
        return json(201, {});
      }
      if (url.pathname === '/orgs/acme/repos') return json(403, { message: 'Resource not accessible by personal access token' });
      const repo = url.pathname.match(/^\/repos\/octo\/([^/]+)(\/.*)?$/);
      if (!repo || !repos.has(repo[1])) return json(404, { message: 'Not Found' });
      if (!repo[2]) return json(200, { permissions: { push: true } });
      if (repo[2].startsWith('/contents/')) {
        if (method === 'GET') return json(404, { message: 'Not Found' });
        if (failCommit) return json(500, { message: 'Server Error' });
        return json(201, { commit: { sha: 'abc123', html_url: `https://github.com/octo/${repo[1]}/commit/abc123` } });
      }
      if (repo[2] === '/git/refs') return json(201, {});
      return json(404, { message: 'Not Found' });
    });
    const publish = (version: string, extra: object = {}) => app.inject({
      method: 'POST', url: '/api/v1/packages', headers: auth,
      payload: {
        metadata: {
          id, version, title: 'GitHub Test', summary: 'Paket fuer den GitHub-Spiegel.', language: 'de-CH', license: 'CC-BY-4.0',
          taxonomy: { subject: 'Informatik', subject_category: 'SF' }, release_notes: `Notes ${version}`, ...extra,
        },
        xml: validXml,
      },
    });
    try {
      expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/account/github', headers: auth })).body).connected).toBe(false);
      // Linking needs a connected GitHub account.
      expect((await publish('1.0.0', { github_repo: 'git@github.com:octo/questions.git' })).statusCode).toBe(400);

      // A token GitHub rejects is not stored; an accepted one is stored encrypted and never returned.
      const put = (token: string) => app.inject({ method: 'PUT', url: '/api/v1/account/github', headers: auth, payload: { token } });
      expect((await put('github_pat_wrong_token_000000000000')).statusCode).toBe(400);
      const connected = await put(ghToken);
      expect(connected.statusCode).toBe(200);
      expect(JSON.parse(connected.body)).toEqual({ connected: true, login: 'octo' });
      const me = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: auth })).body);
      const stored = await getDatabase()('users').where({ id: me.id }).first('github_token_enc');
      expect(stored.github_token_enc).not.toContain(ghToken);
      expect(JSON.stringify(me)).not.toContain('github_token');

      expect((await publish('1.0.0', { github_repo: 'https://gitlab.com/octo/questions' })).statusCode).toBe(400);
      calls.length = 0;
      const first = await publish('1.0.0', { github_repo: 'git@github.com:octo/questions.git' });
      expect(first.statusCode).toBe(201);
      expect(JSON.parse(first.body).github).toEqual({ status: 'ok', commit_url: 'https://github.com/octo/questions/commit/abc123', warning: null });
      const commit = calls.find(c => c.method === 'PUT')!;
      expect(commit.path).toBe(`/repos/octo/questions/contents/${id}.xml`);
      expect(commit.body.message).toBe('Notes 1.0.0');
      expect(Buffer.from(commit.body.content, 'base64').toString('utf8')).toBe(validXml);
      expect(calls.find(c => c.path.endsWith('/git/refs'))!.body).toEqual({ ref: 'refs/tags/v1.0.0', sha: 'abc123' });

      // Admins see the link and the commit; anonymous visitors of the public package do not.
      const owned = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}`, headers: auth })).body);
      expect(owned.github_repo).toBe('git@github.com:octo/questions.git');
      expect(owned.releases[0].github_commit_url).toBe('https://github.com/octo/questions/commit/abc123');
      const anonymous = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}` })).body);
      expect(anonymous.github_repo).toBeUndefined();
      expect(anonymous.releases[0].github_commit_url).toBeUndefined();

      // A failed commit never undoes the publish: the release exists and carries the error.
      failCommit = true;
      const second = await publish('1.1.0');
      expect(second.statusCode).toBe(201);
      expect(JSON.parse(second.body).github.status).toBe('error');
      const afterFail = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}`, headers: auth })).body);
      expect(afterFail.latest_version).toBe('1.1.0');
      expect(afterFail.releases.find((r: any) => r.version === '1.1.0').github_error).toContain('GitHub 500');

      // Clearing the field in the settings unlinks: the next release makes no GitHub call.
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth, payload: { github_repo: '' } })).statusCode).toBe(200);
      calls.length = 0;
      const third = await publish('1.2.0');
      expect(JSON.parse(third.body).github).toBeNull();
      expect(calls).toHaveLength(0);

      // Linking again in the settings commits the current version right away; saving it unchanged does not.
      failCommit = false;
      const patchRepo = () => app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth, payload: { github_repo: 'https://github.com/octo/questions' } });
      const relinked = await patchRepo();
      expect(relinked.statusCode).toBe(200);
      expect(JSON.parse(relinked.body)).toMatchObject({ github_repo: 'git@github.com:octo/questions.git', github_sync: { status: 'ok' } });
      expect(calls.find(c => c.method === 'PUT')!.body.message).toBe('Notes 1.2.0');
      expect(calls.find(c => c.path.endsWith('/git/refs'))!.body.ref).toBe('refs/tags/v1.2.0');
      calls.length = 0;
      expect(JSON.parse((await patchRepo()).body).github_sync).toBeNull();
      expect(calls.some(c => c.method === 'PUT')).toBe(false);

      // A repository that does not exist yet is created privately in the own account, then receives the version.
      calls.length = 0;
      const createdRepo = await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth, payload: { github_repo: `git@github.com:octo/${id}.git` } });
      expect(createdRepo.statusCode).toBe(200);
      expect(JSON.parse(createdRepo.body).github_sync).toMatchObject({ status: 'ok', repo_created: true });
      expect(calls.find(c => c.path === '/user/repos')!.body).toMatchObject({ name: id, private: true, auto_init: true });
      expect(calls.find(c => c.method === 'PUT')!.path).toBe(`/repos/octo/${id}/contents/${id}.xml`);
      // Another owner is created as an organisation repository; refused there, the link is not changed.
      const refused = await app.inject({ method: 'PATCH', url: `/api/v1/packages/${id}`, headers: auth, payload: { github_repo: 'git@github.com:acme/fragen.git' } });
      expect(refused.statusCode).toBe(400);
      expect(JSON.parse(refused.body).message).toContain('Administration');
      expect(JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/packages/${id}`, headers: auth })).body).github_repo).toBe(`git@github.com:octo/${id}.git`);

      expect((await app.inject({ method: 'DELETE', url: '/api/v1/account/github', headers: auth })).statusCode).toBe(204);
      expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/account/github', headers: auth })).body).connected).toBe(false);
    } finally {
      fetchMock.mockRestore();
      await app.inject({ method: 'DELETE', url: `/api/v1/packages/${id}`, headers: auth });
      await app.inject({ method: 'DELETE', url: '/api/v1/account/github', headers: auth });
    }
  });

  it('admin overview and final deletion of withdrawn packages are admin-only', async () => {
    const auth = { authorization: `Bearer ${teacherJwtToken}` };
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: auth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/overview' })).statusCode).toBe(401);

    // The role is read from the database: the existing JWT works as soon as the role changes.
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: auth })).body);
    await getDatabase()('users').where({ id: me.id }).update({ role: 'admin' });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: auth });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const teacher = body.users.find((u: any) => u.id === me.id);
      expect(teacher.role).toBe('admin');
      expect(teacher.packages.some((p: any) => p.id === testPkgId)).toBe(true);
      expect(body.users.every((u: any) => !('password_hash' in u))).toBe(true);
      // The lifecycle package was withdrawn completely above and only its tombstone remains.
      expect(body.withdrawn.some((w: any) => w.id === lifecycleId)).toBe(true);

      expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/withdrawn/${testPkgId}`, headers: auth })).statusCode).toBe(409);
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/withdrawn/${lifecycleId}`, headers: auth })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/api/v1/packages/${lifecycleId}` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/withdrawn/${lifecycleId}`, headers: auth })).statusCode).toBe(404);

      // Accounts: not the own one, not one that still owns packages; others with their tokens.
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${me.id}`, headers: auth })).statusCode).toBe(409);
      const temp = JSON.parse((await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { altcha: await captcha(), email: `delete-me-${Date.now()}@example.ch`, password: 'Delete-Me-Pass-123!', full_name: 'Wegwerf Konto', institution: 'Kanti X', canton: 'BE' },
      })).body);
      expect((await app.inject({ method: 'POST', url: `/api/v1/admin/users/${temp.user.id}/email`, headers: auth,
        payload: { subject: 'Hallo', message: 'Test' } })).statusCode).toBe(503);
      expect((await app.inject({ method: 'POST', url: `/api/v1/admin/users/${temp.user.id}/email`, headers: auth,
        payload: { subject: '', message: 'Test' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${temp.user.id}`, headers: auth })).statusCode).toBe(204);
      expect(await getDatabase()('users').where({ id: temp.user.id }).first()).toBeUndefined();
      expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${temp.user.id}`, headers: auth })).statusCode).toBe(404);

      // Creating an account without password returns a generated initial password once; it works for login.
      const newEmail = `created-${Date.now()}@example.ch`;
      const created = await app.inject({ method: 'POST', url: '/api/v1/admin/users', headers: auth,
        payload: { email: newEmail, full_name: 'Neue Lehrperson', institution: 'Kanti Y', canton: 'ZH', role: 'teacher' } });
      expect(created.statusCode).toBe(201);
      const createdBody = JSON.parse(created.body);
      expect(createdBody.user.email).toBe(newEmail);
      expect(createdBody.user.role).toBe('teacher');
      expect(createdBody.initial_password.length).toBeGreaterThanOrEqual(12);
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login',
        payload: { altcha: await captcha(), email: newEmail, password: createdBody.initial_password } });
      expect(login.statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/v1/admin/users', headers: auth,
        payload: { email: newEmail, full_name: 'Doppelt', institution: 'Kanti Y', canton: 'ZH' } })).statusCode).toBe(409);
      expect((await app.inject({ method: 'POST', url: '/api/v1/admin/users', headers: auth,
        payload: { email: 'kein-mail', full_name: 'X Y', institution: 'Kanti Y', canton: 'ZH' } })).statusCode).toBe(400);
      await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${createdBody.user.id}`, headers: auth });
    } finally {
      await getDatabase()('users').where({ id: me.id }).update({ role: 'teacher' });
    }
  });
});
