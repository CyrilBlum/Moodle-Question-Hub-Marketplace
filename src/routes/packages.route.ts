import { FastifyInstance } from 'fastify';
import fs from 'fs';
import { PackageService, PackageSearchFilters } from '../services/package.service';
import { SafeXmlValidatorService } from '../services/xml-validator.service';
import { PackageStorageService } from '../services/package-storage.service';
import { PreviewSanitizerService } from '../services/preview-sanitizer.service';
import { PackageManifest } from '../types/package.types';

export async function packageRoutes(app: FastifyInstance): Promise<void> {
  const packageService = PackageService.getInstance();
  const storageService = PackageStorageService.getInstance();

  // 1. GET /api/v1/packages
  app.get('/packages', async (req, reply) => {
    const query = req.query as PackageSearchFilters;
    const result = await packageService.searchPackages(query);
    return reply.status(200).send(result);
  });

  // 2. POST /api/v1/packages/preflight
  app.post('/packages/preflight', { preHandler: [app.authenticate] }, async (req, reply) => {
    let xmlContent = '';

    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          xmlContent = SafeXmlValidatorService.decodeUpload(buffer);
        } else if (part.type === 'field' && part.fieldname === 'xml') {
          xmlContent = String(part.value);
        }
      }
    } else if (typeof req.body === 'string') {
      xmlContent = req.body;
    } else if (req.body && typeof (req.body as any).xml === 'string') {
      xmlContent = (req.body as any).xml;
    }

    if (!xmlContent) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Keine XML-Datei oder XML-Nutzlast übermittelt.',
      });
    }

    const report = SafeXmlValidatorService.validatePackage(xmlContent);
    return reply.status(200).send(report);
  });

  // 3. POST /api/v1/packages (Publish new release)
  app.post('/packages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    let xmlContent = '';
    let metadata: PackageManifest | null = null;

    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          xmlContent = SafeXmlValidatorService.decodeUpload(buffer);
        } else if (part.type === 'field') {
          if (part.fieldname === 'metadata') {
            try {
              metadata = typeof part.value === 'string' ? JSON.parse(part.value) : part.value;
            } catch {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Ungültiges JSON-Format im Feld metadata.',
              });
            }
          } else if (part.fieldname === 'xml') {
            xmlContent = String(part.value);
          }
        }
      }
    } else if (req.body && typeof req.body === 'object') {
      const body = req.body as any;
      xmlContent = body.xml || body.file || '';
      metadata = body.metadata || null;
    }

    if (!xmlContent || !metadata) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Sowohl XML-Datei als auch Metadaten-Manifest sind erforderlich.',
      });
    }

    try {
      const published = await packageService.publishPackage(user.id, metadata, xmlContent);
      return reply.status(201).send(published);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.startsWith('BAD_REQUEST:')) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: msg.replace('BAD_REQUEST: ', ''),
          diagnostics: err.diagnostics,
        });
      }
      if (msg.startsWith('FORBIDDEN:')) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: msg.replace('FORBIDDEN: ', ''),
        });
      }
      if (msg.startsWith('CONFLICT:')) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: msg.replace('CONFLICT: ', ''),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: msg,
      });
    }
  });

  // 4. GET /api/v1/packages/:id/preview
  app.get('/packages/:id/preview', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { version?: string };

    const pkg = await packageService.getPackage(id);
    if (!pkg) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Paket '${id}' nicht gefunden.`,
      });
    }

    if (!pkg.preview_enabled) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PREVIEW_DISABLED',
        message: 'Die Autorin oder der Autor hat die öffentliche Vorschau für dieses Paket deaktiviert.',
      });
    }

    const version = query.version || pkg.latest_version;
    let filePath: string;
    try {
      filePath = storageService.getReleaseFilePath(id, version);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Version '${version}' für Paket '${id}' nicht gefunden.`,
      });
    }

    const xmlContent = await fs.promises.readFile(filePath, 'utf-8');
    const preview = PreviewSanitizerService.sanitizeXmlToPreview(id, version, pkg.title, xmlContent);
    return reply.status(200).send(preview);
  });

  // 5. GET /api/v1/packages/:id/releases/:version/download
  app.get('/packages/:id/releases/:version/download', async (req, reply) => {
    const { id, version } = req.params as { id: string; version: string };

    const release = await packageService.getRelease(id, version);
    if (!release) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Release ${id}@${version} nicht gefunden.`,
      });
    }

    let filePath: string;
    try {
      filePath = storageService.getReleaseFilePath(id, release.version);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Paketdatei für ${id}@${version} nicht gefunden.`,
      });
    }

    const fileStat = await fs.promises.stat(filePath);
    const sanitizedFilename = `package-${id}-${release.version}.xml`.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Handle ETag caching
    if (req.headers['if-none-match'] === `"${release.sha256}"`) {
      return reply.status(304).send();
    }

    // Increment download counter asynchronously
    packageService.incrementDownloadCount(id).catch(() => {});

    reply.headers({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
      'Content-Length': fileStat.size,
      'ETag': `"${release.sha256}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Package-Sha256': release.sha256,
      'X-Content-Type-Options': 'nosniff',
    });

    const fileStream = fs.createReadStream(filePath);
    return reply.send(fileStream);
  });

  // 7. GET /api/v1/account/packages (own packages)
  app.get('/account/packages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    return reply.status(200).send({ data: await packageService.listOwnedPackages(user.id) });
  });

  const withdrawErrors = (err: any, reply: any) => {
    const msg: string = err.message || '';
    const map: Record<string, [number, string]> = {
      'NOT_FOUND:': [404, 'Not Found'],
      'FORBIDDEN:': [403, 'Forbidden'],
      'CONFLICT:': [409, 'Conflict'],
    };
    for (const [prefix, [code, name]] of Object.entries(map)) {
      if (msg.startsWith(prefix)) {
        return reply.status(code).send({ statusCode: code, error: name, message: msg.slice(prefix.length).trim() });
      }
    }
    return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: msg });
  };

  // 8. DELETE /api/v1/packages/:id (withdraw the whole package)
  app.delete('/packages/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    try {
      await packageService.withdrawPackage(user.id, user.role === 'admin', id);
      return reply.status(204).send();
    } catch (err) {
      return withdrawErrors(err, reply);
    }
  });

  // 9. DELETE /api/v1/packages/:id/releases/:version (withdraw one version)
  app.delete('/packages/:id/releases/:version', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const { id, version } = req.params as { id: string; version: string };
    try {
      await packageService.withdrawRelease(user.id, user.role === 'admin', id, version);
      return reply.status(204).send();
    } catch (err) {
      return withdrawErrors(err, reply);
    }
  });

  // 6. GET /api/v1/packages/:id
  app.get('/packages/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const pkg = await packageService.getPackage(id);
    if (!pkg) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Paket '${id}' nicht gefunden.`,
      });
    }
    return reply.status(200).send(pkg);
  });
}
