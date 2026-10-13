import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TokenService } from '../services/token.service';

const CreateTokenSchema = z.object({
  name: z.string().min(1, 'Token-Name ist erforderlich'),
  expires_in_days: z.number().int().positive().optional(),
});

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  const tokenService = TokenService.getInstance();

  // GET /api/v1/account/tokens
  app.get('/account/tokens', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const tokens = await tokenService.listTokens(user.id);
    return reply.status(200).send(tokens);
  });

  // POST /api/v1/account/tokens
  app.post('/account/tokens', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const parseResult = CreateTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validierungsfehler bei Token-Erstellung',
      });
    }

    const created = await tokenService.createToken(
      user.id,
      parseResult.data.name,
      parseResult.data.expires_in_days
    );

    return reply.status(201).send(created);
  });

  // DELETE /api/v1/account/tokens/:id
  app.delete('/account/tokens/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };

    const success = await tokenService.revokeToken(user.id, id);
    if (!success) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Token nicht gefunden.',
      });
    }

    return reply.status(204).send();
  });
}
