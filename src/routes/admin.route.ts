import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AdminService } from '../services/admin.service';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const adminService = AdminService.getInstance();

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!user || !(await adminService.isAdmin(user.id))) {
      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Nur für Administratorinnen und Administratoren.' });
    }
  };

  // GET /api/v1/admin/overview: all users with their packages, plus withdrawn packages
  app.get('/admin/overview', { preHandler: [app.authenticate, requireAdmin] }, async (_req, reply) => {
    return reply.status(200).send(await adminService.overview());
  });

  // DELETE /api/v1/admin/withdrawn/:id: final deletion of a withdrawn package (frees the ID)
  app.delete('/admin/withdrawn/:id', { preHandler: [app.authenticate, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await adminService.purgeWithdrawnPackage(id);
      return reply.status(204).send();
    } catch (err: any) {
      const msg: string = err.message || '';
      for (const [prefix, code, name] of [['NOT_FOUND:', 404, 'Not Found'], ['CONFLICT:', 409, 'Conflict']] as const) {
        if (msg.startsWith(prefix)) {
          return reply.status(code).send({ statusCode: code, error: name, message: msg.slice(prefix.length).trim() });
        }
      }
      throw err;
    }
  });
}
