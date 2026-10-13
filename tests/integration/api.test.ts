import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import { runMigrations } from '../../src/database/migrate';
import { runSeeds } from '../../src/database/seed';
import { closeDatabase } from '../../src/database/connection';
import { CryptoService } from '../../src/services/crypto.service';

describe('Marketplace REST API Endpoints Integration Tests', () => {
  let app: FastifyInstance;
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  let teacherJwtToken: string;
  let patToken: string;
  let patId: string;

  beforeAll(async () => {
    // Run DB migrations and seed
    await runMigrations();
    await runSeeds();

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
        email: 'teacher@kanti.ch',
        password: 'MoodleHub2026!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('teacher@kanti.ch');
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
});
