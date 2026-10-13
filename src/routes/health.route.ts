import { FastifyInstance } from 'fastify';
import fs from 'fs';
import { getDatabase } from '../database/connection';
import { getConfig } from '../config';
import { PackageStorageService } from '../services/package-storage.service';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const config = getConfig();
    const knex = getDatabase();
    const storageService = PackageStorageService.getInstance();

    let dbStatus = 'connected';
    try {
      await knex.raw('SELECT 1');
    } catch {
      dbStatus = 'disconnected';
    }

    let storageStatus = 'writable';
    try {
      await fs.promises.access(storageService.getStorageRoot(), fs.constants.W_OK);
    } catch {
      storageStatus = 'readonly_or_inaccessible';
    }

    return reply.status(200).send({
      status: 'ok',
      version: '1.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        dialect: config.DB_DIALECT,
      },
      storage: {
        status: storageStatus,
        path: storageService.getStorageRoot(),
      },
      monetisation: {
        enabled: config.MONETISATION_ENABLED,
      },
    });
  });
}
