import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';

/** Optional GitHub connection of the own account: the token is stored encrypted and never returned. */
export async function githubRoutes(app: FastifyInstance): Promise<void> {
  const github = GitHubService.getInstance();

  // GET /api/v1/account/github
  app.get('/account/github', { preHandler: [app.authenticate] }, async (req, reply) => {
    return reply.status(200).send(await github.getConnection((req as any).user.id));
  });

  // PUT /api/v1/account/github
  app.put('/account/github', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const token = (req.body as any)?.token;
    if (typeof token !== 'string' || token.trim().length < 20 || token.trim().length > 500 || /\s/.test(token.trim())) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Bitte fügen Sie einen gültigen GitHub-Token ein.' });
    }
    try {
      return reply.status(200).send(await github.connect((req as any).user.id, token.trim()));
    } catch (err: any) {
      const msg: string = err.message || '';
      if (msg.startsWith('BAD_REQUEST:')) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: msg.replace('BAD_REQUEST: ', '') });
      }
      return reply.status(502).send({ statusCode: 502, error: 'Bad Gateway', message: msg });
    }
  });

  // DELETE /api/v1/account/github
  app.delete('/account/github', { preHandler: [app.authenticate] }, async (req, reply) => {
    await github.disconnect((req as any).user.id);
    return reply.status(204).send();
  });
}
