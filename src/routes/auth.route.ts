import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { AdminService } from '../services/admin.service';
import { CaptchaService } from '../services/captcha.service';
import { PasswordResetService } from '../services/password-reset.service';
import { EmailService } from '../services/email.service';

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
const ForgotSchema = z.object({ email: z.string().email() });
const ResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein.'),
});
const ProfileSchema = z.object({ email: z.string().email(), full_name: z.string().min(2), institution: z.string().min(2), canton: z.string().length(2), profile_role: z.string().max(100).optional(), password: z.string().min(8).optional().or(z.literal('')) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = AuthService.getInstance();

  /** 400 unless the request carries a solved, unused captcha (field `altcha`); null when it passes. */
  const captchaRejected = (req: any, reply: any) => {
    if (!CaptchaService.isEnabled() || CaptchaService.verify((req.body as any)?.altcha)) return null;
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      code: 'CAPTCHA_FAILED',
      message: 'Die Sicherheitsprüfung ist fehlgeschlagen oder abgelaufen. Bitte bestätigen Sie sie erneut.',
    });
  };

  // GET /api/v1/auth/captcha (challenge for the ALTCHA widget on the login and registration forms)
  app.get('/auth/captcha', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return reply.status(200).send(CaptchaService.createChallenge());
  });

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

    const rejected = captchaRejected(req, reply);
    if (rejected) return rejected;

    try {
      const { user } = await authService.register(parseResult.data);
      // Best effort and not awaited: a slow or failing mail server must not delay the registration.
      const { email, full_name, institution, canton } = parseResult.data;
      AdminService.getInstance().notifyNewAccount({ email, full_name, institution, canton })
        .catch(err => req.log.error({ code: err?.code || 'EMAIL_DELIVERY_FAILED' }, 'Failed to notify admins of a new account'));
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
    const rejected = captchaRejected(req, reply);
    if (rejected) return rejected;

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

  // POST /api/v1/auth/password/forgot: mails a reset link. The answer is the same whether the address
  // has an account or not, so the form does not reveal who is registered.
  app.post('/auth/password/forgot', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const parsed = ForgotSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' });
    }
    const rejected = captchaRejected(req, reply);
    if (rejected) return rejected;
    if (!EmailService.isConfigured()) {
      return reply.status(503).send({
        statusCode: 503, error: 'Service Unavailable', code: 'EMAIL_NOT_CONFIGURED',
        message: 'E-Mail-Versand ist derzeit nicht eingerichtet. Wenden Sie sich an die Administration des Hubs.',
      });
    }
    const created = await PasswordResetService.getInstance().createToken(parsed.data.email);
    if (created) {
      // Not awaited: the answer must not take longer for existing accounts than for unknown addresses.
      EmailService.sendPasswordReset({ to: created.user.email, name: created.user.full_name, token: created.token })
        .catch(err => req.log.error({ code: err?.code || 'EMAIL_DELIVERY_FAILED' }, 'Failed to send password reset email'));
    }
    return reply.status(200).send({
      status: 'sent',
      message: 'Falls zu dieser Adresse ein Konto besteht, haben wir einen Link zum Zurücksetzen geschickt. Er ist eine Stunde gültig.',
    });
  });

  // GET /api/v1/auth/password/reset?token=…: whether the link can still be used.
  app.get('/auth/password/reset', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const token = String((req.query as any)?.token || '');
    reply.header('Cache-Control', 'no-store');
    return reply.status(200).send({ valid: await PasswordResetService.getInstance().isValid(token) });
  });

  // POST /api/v1/auth/password/reset: sets the new password with a valid link.
  app.post('/auth/password/reset', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const parsed = ResetSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400, error: 'Bad Request',
        message: parsed.error.issues.find(i => i.path[0] === 'password')?.message || 'Der Link ist ungültig oder abgelaufen. Fordern Sie einen neuen an.',
      });
    }
    try {
      await PasswordResetService.getInstance().resetPassword(parsed.data.token, parsed.data.password);
      return reply.status(200).send({ status: 'reset', message: 'Ihr Passwort wurde geändert. Sie können sich jetzt anmelden.' });
    } catch (err: any) {
      if (String(err.message).startsWith('BAD_REQUEST:')) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message.replace('BAD_REQUEST: ', '') });
      }
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
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
