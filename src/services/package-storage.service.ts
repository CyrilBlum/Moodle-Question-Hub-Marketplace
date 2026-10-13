import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getConfig } from '../config';

export class PackageStorageService {
  private static instance: PackageStorageService | null = null;
  private readonly storageRoot: string;
  private readonly artifactsDir: string;
  private readonly releasesDir: string;
  private readonly tmpDir: string;

  constructor(customStorageRoot?: string) {
    this.storageRoot = path.resolve(customStorageRoot || getConfig().STORAGE_ROOT);
    this.artifactsDir = path.join(this.storageRoot, 'artifacts', 'sha256');
    this.releasesDir = path.join(this.storageRoot, 'releases');
    this.tmpDir = path.join(this.storageRoot, 'tmp');
  }

  public static getInstance(): PackageStorageService {
    if (!PackageStorageService.instance) {
      PackageStorageService.instance = new PackageStorageService();
    }
    return PackageStorageService.instance;
  }

  public async init(): Promise<void> {
    await fs.promises.mkdir(this.artifactsDir, { recursive: true });
    await fs.promises.mkdir(this.releasesDir, { recursive: true });
    await fs.promises.mkdir(this.tmpDir, { recursive: true });
  }

  public getStorageRoot(): string {
    return this.storageRoot;
  }

  /**
   * Stages an uploaded package stream or buffer to a temporary file while computing its SHA-256 hash.
   */
  public async stageUpload(
    input: Readable | Buffer | string
  ): Promise<{ tempPath: string; sha256: string; sizeBytes: number }> {
    await this.init();

    const uploadId = crypto.randomUUID();
    const tempPath = path.join(this.tmpDir, `upload_${uploadId}.tmp`);

    if (Buffer.isBuffer(input) || typeof input === 'string') {
      const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      await fs.promises.writeFile(tempPath, buffer);
      return { tempPath, sha256, sizeBytes: buffer.length };
    }

    const hash = crypto.createHash('sha256');
    let sizeBytes = 0;
    const fileWriteStream = fs.createWriteStream(tempPath);

    input.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      sizeBytes += chunk.length;
    });

    await pipeline(input, fileWriteStream);
    const sha256 = hash.digest('hex');
    return { tempPath, sha256, sizeBytes };
  }

  /**
   * Commits the staged file to CAS artifacts and creates the immutable release symlink.
   */
  public async commitRelease(
    tempPath: string,
    sha256: string,
    packageId: string,
    version: string,
    manifest: object
  ): Promise<{ artifactPath: string; releasePath: string }> {
    await this.init();

    const prefix1 = sha256.substring(0, 2);
    const prefix2 = sha256.substring(2, 4);
    const artifactFolder = path.join(this.artifactsDir, prefix1, prefix2);
    const artifactPath = path.join(artifactFolder, `${sha256}.xml`);

    await fs.promises.mkdir(artifactFolder, { recursive: true });

    // Deduplication check: if artifact already exists, discard temporary file
    if (fs.existsSync(artifactPath)) {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } else {
      // Atomic rename moves the file into place instantaneously
      await fs.promises.rename(tempPath, artifactPath);
    }

    // Set file permissions to read-only (0444) to prevent accidental mutation
    try {
      await fs.promises.chmod(artifactPath, 0o444);
    } catch {
      // Permissions may be constrained in some test environments
    }

    // Create release directory structure
    const releaseFolder = path.join(this.releasesDir, packageId, version);
    await fs.promises.mkdir(releaseFolder, { recursive: true });

    // Write metadata manifest
    const manifestPath = path.join(releaseFolder, 'manifest.json');
    await fs.promises.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      { encoding: 'utf-8', mode: 0o444 }
    );

    // Create relative symlink to CAS artifact
    const releaseXmlPath = path.join(releaseFolder, 'package.xml');
    if (fs.existsSync(releaseXmlPath)) {
      try {
        await fs.promises.unlink(releaseXmlPath);
      } catch {
        // Ignored
      }
    }
    const relativeArtifactPath = path.relative(releaseFolder, artifactPath);
    try {
      await fs.promises.symlink(relativeArtifactPath, releaseXmlPath);
    } catch {
      // Fallback to copy if symlink fails on filesystem
      await fs.promises.copyFile(artifactPath, releaseXmlPath);
    }

    return {
      artifactPath,
      releasePath: releaseXmlPath,
    };
  }

  /**
   * Resolves the verified filesystem path for a package release.
   */
  public getReleaseFilePath(packageId: string, version: string): string {
    const releaseXmlPath = path.join(this.releasesDir, packageId, version, 'package.xml');
    if (!fs.existsSync(releaseXmlPath)) {
      throw new Error(`Release-Datei für ${packageId}@${version} nicht gefunden.`);
    }
    return releaseXmlPath;
  }

  public getReleaseManifestPath(packageId: string, version: string): string {
    const manifestPath = path.join(this.releasesDir, packageId, version, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Release-Manifest für ${packageId}@${version} nicht gefunden.`);
    }
    return manifestPath;
  }

  public hasRelease(packageId: string, version: string): boolean {
    const releaseXmlPath = path.join(this.releasesDir, packageId, version, 'package.xml');
    return fs.existsSync(releaseXmlPath);
  }
}
