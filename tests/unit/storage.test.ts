import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PackageStorageService } from '../../src/services/package-storage.service';

describe('PackageStorageService CAS Engine Tests', () => {
  const testStorageDir = path.resolve(__dirname, '../temp_storage_test');
  let storage: PackageStorageService;

  beforeAll(async () => {
    if (fs.existsSync(testStorageDir)) {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    }
    storage = new PackageStorageService(testStorageDir);
    await storage.init();
  });

  afterAll(async () => {
    if (fs.existsSync(testStorageDir)) {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  it('stages an upload and computes exact SHA-256 hash', async () => {
    const content = '<quiz><question type="description"><name><text>Intro</text></name></question></quiz>';
    const staged = await storage.stageUpload(content);

    expect(fs.existsSync(staged.tempPath)).toBe(true);
    expect(staged.sizeBytes).toBe(Buffer.byteLength(content));
    expect(staged.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('commits a release into CAS sharded directory with immutable symlink', async () => {
    const content = '<quiz><question type="description"><name><text>Release 1.0.0</text></name></question></quiz>';
    const staged = await storage.stageUpload(content);

    const manifest = { id: 'ch.gym.inf.test', version: '1.0.0', title: 'Test Paket' };
    const result = await storage.commitRelease(
      staged.tempPath,
      staged.sha256,
      'ch.gym.inf.test',
      '1.0.0',
      manifest
    );

    expect(fs.existsSync(result.artifactPath)).toBe(true);
    expect(fs.existsSync(result.releasePath)).toBe(true);
    expect(storage.hasRelease('ch.gym.inf.test', '1.0.0')).toBe(true);

    const resolved = storage.getReleaseFilePath('ch.gym.inf.test', '1.0.0');
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('deduplicates identical file uploads in CAS store', async () => {
    const identicalContent = '<quiz><question type="description"><name><text>Deduplication</text></name></question></quiz>';

    const stage1 = await storage.stageUpload(identicalContent);
    const result1 = await storage.commitRelease(
      stage1.tempPath,
      stage1.sha256,
      'ch.gym.pkg.one',
      '1.0.0',
      { id: 'ch.gym.pkg.one', version: '1.0.0' }
    );

    const stage2 = await storage.stageUpload(identicalContent);
    expect(stage2.sha256).toBe(stage1.sha256);

    const result2 = await storage.commitRelease(
      stage2.tempPath,
      stage2.sha256,
      'ch.gym.pkg.two',
      '1.0.0',
      { id: 'ch.gym.pkg.two', version: '1.0.0' }
    );

    // Both releases must share the exact same underlying CAS artifact path
    expect(result1.artifactPath).toBe(result2.artifactPath);
    expect(fs.existsSync(result1.artifactPath)).toBe(true);
  });
});
