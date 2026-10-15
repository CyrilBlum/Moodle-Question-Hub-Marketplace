import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminService } from '../services/admin.service';

const EmailSchema = z.object({
  subject: z.string().trim().min(1, 'Betreff fehlt.').max(200),
  message: z.string().trim().min(1, 'Nachricht fehlt.').max(10000),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const adminService = AdminService.getInstance();

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!user || !(await adminService.isAdmin(user.id))) {
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Nur für Administratorinnen und Administratoren.' });
    }
  };
  const guard = { preHandler: [app.authenticate, requireAdmin] };

  /** Maps service errors (NOT_FOUND:, CONFLICT:, SMTP_NOT_CONFIGURED) to HTTP answers. */
  const sendError = (err: any, reply: FastifyReply) => {
    const msg: string = err.message || '';
    if (msg === 'SMTP_NOT_CONFIGURED') {
      return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', code: 'SMTP_NOT_CONFIGURED',
        message: 'Der Hub hat keinen E-Mail-Versand (SMTP) konfiguriert.' });
    }
    for (const [prefix, code, name] of [['NOT_FOUND:', 404, 'Not Found'], ['CONFLICT:', 409, 'Conflict']] as const) {
      if (msg.startsWith(prefix)) {
        return reply.status(code).send({ statusCode: code, error: name, message: msg.slice(prefix.length).trim() });
      }
    }
    throw err;
  };

  // GET /api/v1/admin/overview: all users with their packages, plus withdrawn packages
  app.get('/admin/overview', guard, async (_req, reply) => {
    return reply.status(200).send(await adminService.overview());
  });

  // DELETE /api/v1/admin/withdrawn/:id: final deletion of a withdrawn package (frees the ID)
  app.delete('/admin/withdrawn/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await adminService.purgeWithdrawnPackage(id);
      return reply.status(204).send();
    } catch (err: any) {
      return sendError(err, reply);
    }
  });

  // DELETE /api/v1/admin/users/:id: delete an account without active packages
  app.delete('/admin/users/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await adminService.deleteUser((req as any).user.id, id);
      return reply.status(204).send();
    } catch (err: any) {
      return sendError(err, reply);
    }
  });

  // POST /api/v1/admin/users/:id/email: send a message to an account (needs SMTP)
  app.post('/admin/users/:id/email', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = EmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message || 'Ungültige Eingabe.' });
    }
    try {
      await adminService.emailUser((req as any).user.id, id, parsed.data.subject, parsed.data.message);
      return reply.status(204).send();
    } catch (err: any) {
      return sendError(err, reply);
    }
  });
}
