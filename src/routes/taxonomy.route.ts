import { FastifyInstance } from 'fastify';
import { TaxonomyService } from '../services/taxonomy.service';

export async function taxonomyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/taxonomy', async (_req, reply) => {
    const taxonomyService = TaxonomyService.getInstance();
    const catalog = taxonomyService.getCatalog();
    return reply.status(200).send(catalog);
  });
}
