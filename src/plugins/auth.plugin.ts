import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { getConfig } from '../config';
import { TokenService } from '../services/token.service';
import { UserPublicProfile } from '../types/user.types';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateOptional: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: UserPublicProfile;
  }
}

async function authPluginAsync(fastify: FastifyInstance): Promise<void> {
  const config = getConfig();

  await fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Kein Autorisierungs-Token vorhanden.',
        });
      }

      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Ungültiges Autorisierungsformat. Format: Bearer <token>.',
        });
      }

      // 1. Check if token is a Personal Access Token (PAT)
      if (token.startsWith('mqh_pat_')) {
        const user = await TokenService.getInstance().authenticatePat(token);
        if (!user) {
          return reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Ungültiger oder abgelaufener Personal Access Token (PAT).',
          });
        }
        (request as any).user = user;
        return;
      }

      // 2. Otherwise verify JWT
      await request.jwtVerify();
    } catch (err: any) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token ungültig oder abgelaufen.',
      });
    }
  });

  fastify.decorate('authenticateOptional', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) return;
    await fastify.authenticate(request, reply);
  });
}

export const authPlugin = fp(authPluginAsync);
