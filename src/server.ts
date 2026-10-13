import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { getConfig } from './config';
import { authPlugin } from './plugins/auth.plugin';
import { healthRoutes } from './routes/health.route';
import { packageRoutes } from './routes/packages.route';
import { taxonomyRoutes } from './routes/taxonomy.route';
import { authRoutes } from './routes/auth.route';
import { tokenRoutes } from './routes/tokens.route';
import { oauthRoutes } from './routes/oauth.route';

export async function buildServer(): Promise<FastifyInstance> {
  const config = getConfig();

  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // 1. Core security & HTTP plugins
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
    exposedHeaders: ['ETag', 'Content-Disposition', 'X-Package-Sha256'],
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Allows inline KaTeX styles and Vite assets
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 64 * 1024 * 1024, // 64 MB package limit
    },
  });

  await app.register(fastifySensible);

  if (config.NODE_ENV !== 'test') {
    await app.register(fastifyRateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW_MS,
    });
  }

  // 2. Auth plugin (JWT + PAT)
  await app.register(authPlugin);

  // 3. API Routes under /api/v1
  await app.register(
    async (apiV1) => {
      await apiV1.register(healthRoutes);
      await apiV1.register(packageRoutes);
      await apiV1.register(taxonomyRoutes);
      await apiV1.register(authRoutes);
      await apiV1.register(tokenRoutes);
    },
    { prefix: '/api/v1' }
  );

  // 4. OAuth routes under /oauth
  await app.register(oauthRoutes, { prefix: '/oauth' });

  // 5. Static SPA serving
  const distClientDir = path.resolve(__dirname, '../client');
  const rootClientDir = path.resolve(__dirname, 'client');
  const staticRoot = fs.existsSync(distClientDir) ? distClientDir : rootClientDir;

  if (fs.existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      decorateReply: true,
      wildcard: false,
    });
  }

  // 6. SPA Catch-All Handler (HTML5 History Mode)
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/') || req.raw.url?.startsWith('/oauth/')) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Endpunkt ${req.method}:${req.url} wurde nicht gefunden.`,
      });
    }

    if (fs.existsSync(staticRoot) && fs.existsSync(path.join(staticRoot, 'index.html'))) {
      return reply.sendFile('index.html');
    }

    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Seite nicht gefunden.',
    });
  });

  return app;
}
