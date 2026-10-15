import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein.'),
  full_name: z.string().min(2),
  institution: z.string().min(2),
  canton: z.string().length(2),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const ProfileSchema = z.object({ email: z.string().email(), full_name: z.string().min(2), institution: z.string().min(2), canton: z.string().length(2), profile_role: z.string().max(100).optional(), password: z.string().min(8).optional().or(z.literal('')) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = AuthService.getInstance();

  // POST /api/v1/auth/register
  app.post('/auth/register', async (req, reply) => {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validierungsfehler bei Registrierung',
        details: parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }

    try {
      const { user, userId } = await authService.register(parseResult.data);
      const token = app.jwt.sign({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      });

      return reply.status(201).send({
        user,
        token,
      });
    } catch (err: any) {
      if (err.message?.startsWith('CONFLICT:')) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: err.message.replace('CONFLICT: ', ''),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  // POST /api/v1/auth/login
  app.post('/auth/login', async (req, reply) => {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validierungsfehler bei Login',
      });
    }

    try {
      const user = await authService.login(parseResult.data.email, parseResult.data.password);
      const token = app.jwt.sign({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      });

      return reply.status(200).send({
        user,
        token,
      });
    } catch (err: any) {
      if (err.message?.startsWith('UNAUTHORIZED:')) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: err.message.replace('UNAUTHORIZED: ', ''),
        });
      }
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  // GET /api/v1/auth/me
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userPayload = (req as any).user;
    const user = await authService.getUserById(userPayload.id);
    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Benutzerprofil nicht gefunden.',
      });
    }
    return reply.status(200).send(user);
  });

  app.patch('/auth/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = ProfileSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ message: 'Ungültige Profildaten.' });
    try {
      return reply.send(await authService.updateProfile((req as any).user.id, parsed.data));
    } catch (err: any) {
      return reply.status(err.message?.startsWith('CONFLICT:') ? 409 : 500).send({ message: err.message?.replace('CONFLICT: ', '') || 'Profil konnte nicht gespeichert werden.' });
    }
  });
}
