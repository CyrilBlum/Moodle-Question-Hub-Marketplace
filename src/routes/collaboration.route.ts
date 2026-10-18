import { FastifyInstance } from 'fastify';
import { ForkService } from '../services/fork.service';
import { MergeRequestService } from '../services/merge-request.service';

/** Maps "CODE: message" service errors to HTTP replies; conflicts may carry the keys of unresolved questions. */
function sendError(err: any, reply: any) {
  const msg: string = err?.message || '';
  const map: Record<string, [number, string]> = {
    'BAD_REQUEST:': [400, 'Bad Request'],
    'NOT_FOUND:': [404, 'Not Found'],
    'FORBIDDEN:': [403, 'Forbidden'],
    'CONFLICT:': [409, 'Conflict'],
  };
  for (const [prefix, [code, name]] of Object.entries(map)) {
    if (msg.startsWith(prefix)) {
      return reply.status(code).send({
        statusCode: code, error: name, message: msg.slice(prefix.length).trim(),
        ...(err.conflicts ? { conflicts: err.conflicts } : {}),
        ...(err.diagnostics ? { diagnostics: err.diagnostics } : {}),
      });
    }
  }
  return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: msg });
}

function mrNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error('NOT_FOUND: Änderungsvorschlag nicht gefunden.');
  return n;
}

/** Forks of packages and merge requests from a fork into its original. */
export async function collaborationRoutes(app: FastifyInstance): Promise<void> {
  const forks = ForkService.getInstance();
  const mrs = MergeRequestService.getInstance();
  const userId = (req: any): string | undefined => req.user?.id;

  // ---- Forks
  app.post('/packages/:id/forks', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as Record<string, any>;
    try {
      const created = await forks.forkPackage(userId(req)!, id, {
        id: body.id, title: body.title, version: body.version, visibility: body.visibility, license: body.license,
      });
      return reply.status(201).send(created);
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.get('/packages/:id/forks', { preHandler: [app.authenticateOptional] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send({ data: await forks.listForks(id, userId(req)) });
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.get('/packages/:id/fork-id-suggestion', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send({ id: await forks.suggestId(id) });
    } catch (err) {
      return sendError(err, reply);
    }
  });

  // Ahead/behind against the original; ?details=1 adds the original's changes since the base (sync preview).
  app.get('/packages/:id/fork-status', { preHandler: [app.authenticateOptional] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const details = ['1', 'true'].includes(String((req.query as any)?.details || ''));
    try {
      return reply.send(await forks.status(id, userId(req), details));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.post('/packages/:id/sync-upstream', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as Record<string, any>;
    try {
      return reply.send(await forks.sync(userId(req)!, id, {
        version: typeof body.version === 'string' ? body.version.trim() : undefined,
        release_notes: typeof body.release_notes === 'string' ? body.release_notes : undefined,
        resolutions: body.resolutions && typeof body.resolutions === 'object' ? body.resolutions : {},
      }));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  // ---- Merge requests
  app.get('/account/merge-requests', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      return reply.send(await mrs.listForAccount(userId(req)!));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.get('/packages/:id/merge-requests', { preHandler: [app.authenticateOptional] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const status = String((req.query as any)?.status || 'open');
    try {
      return reply.send({ data: await mrs.list(id, userId(req), status) });
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.post('/packages/:id/merge-requests', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.status(201).send(await mrs.create(userId(req)!, id, (req.body || {}) as any));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.get('/packages/:id/merge-requests/:number', { preHandler: [app.authenticateOptional] }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      return reply.send(await mrs.get(id, mrNumber(number), userId(req)));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.get('/packages/:id/merge-requests/:number/changes', { preHandler: [app.authenticateOptional] }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      return reply.send(await mrs.changes(id, mrNumber(number), userId(req)));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.patch('/packages/:id/merge-requests/:number', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      await mrs.update(userId(req)!, id, mrNumber(number), (req.body || {}) as any);
      return reply.send(await mrs.get(id, mrNumber(number), userId(req)));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.post('/packages/:id/merge-requests/:number/notes', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      return reply.status(201).send(await mrs.comment(userId(req)!, id, mrNumber(number), (req.body || {}) as any));
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.patch('/packages/:id/merge-requests/:number/notes/:noteId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id, number, noteId } = req.params as { id: string; number: string; noteId: string };
    try {
      await mrs.editNote(userId(req)!, id, mrNumber(number), noteId, (req.body || {}) as any);
      return reply.status(204).send();
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.delete('/packages/:id/merge-requests/:number/notes/:noteId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id, number, noteId } = req.params as { id: string; number: string; noteId: string };
    try {
      await mrs.deleteNote(userId(req)!, id, mrNumber(number), noteId);
      return reply.status(204).send();
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.put('/packages/:id/merge-requests/:number/approval', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      await mrs.setApproval(userId(req)!, id, mrNumber(number), true);
      return reply.status(204).send();
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.delete('/packages/:id/merge-requests/:number/approval', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      await mrs.setApproval(userId(req)!, id, mrNumber(number), false);
      return reply.status(204).send();
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.post('/packages/:id/merge-requests/:number/merge', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id, number } = req.params as { id: string; number: string };
    try {
      return reply.send(await mrs.merge(userId(req)!, id, mrNumber(number), (req.body || {}) as any));
    } catch (err) {
      return sendError(err, reply);
    }
  });
}
