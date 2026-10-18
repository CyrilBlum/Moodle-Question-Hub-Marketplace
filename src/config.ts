import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const PUBLIC_JWT_SECRETS = [
  'development-secret-must-be-at-least-32-chars-long!',
  'super-secret-jwt-key-must-be-at-least-32-chars-long!',
];

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(8090),
  PUBLIC_BASE_URL: z.string().default('http://127.0.0.1:8090'),

  // Database Dialect & Configuration
  DB_DIALECT: z.enum(['mariadb', 'sqlite']).default('sqlite'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('questionhub'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('questionhub'),
  DB_SQLITE_PATH: z.string().default('./data/marketplace.sqlite'),

  // Storage
  STORAGE_ROOT: z.string().default('./storage/packages'),

  // Security & JWT
  JWT_SECRET: z.string().default('development-secret-must-be-at-least-32-chars-long!'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  // Outbound email for package access requests
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.preprocess(val => val === 'true' || val === true || val === '1' || val === 1, z.boolean()).default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Proof-of-work captcha (ALTCHA format) on login and registration; the key defaults to one derived from JWT_SECRET
  CAPTCHA_ENABLED: z
    .preprocess(val => !(val === 'false' || val === false || val === '0' || val === 0), z.boolean())
    .default(true),
  CAPTCHA_HMAC_KEY: z.string().optional(),

  // Optional GitHub link of packages: users store a GitHub token (encrypted with a key derived from
  // JWT_SECRET unless GITHUB_TOKEN_KEY is set); every new release is committed to the linked repository.
  GITHUB_API_URL: z.string().default('https://api.github.com'),
  GITHUB_TOKEN_KEY: z.string().optional(),

  // Pluggable Monetisation
  MONETISATION_ENABLED: z
    .preprocess(val => val === 'true' || val === true || val === '1' || val === 1, z.boolean())
    .default(false),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
}).superRefine((config, ctx) => {
  // The source is public: in production the code default or the .env.example value would let anyone forge tokens.
  if (config.NODE_ENV === 'production' && PUBLIC_JWT_SECRETS.includes(config.JWT_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'JWT_SECRET muss in Produktion gesetzt sein' });
  }
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;

export function loadConfig(overrides: Partial<Record<string, any>> = {}): AppConfig {
  const merged = { ...process.env, ...overrides };
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    console.error('Ungültige Umgebungskonfiguration:', result.error.format());
    throw new Error('Konfigurationsvalidierung fehlgeschlagen');
  }
  cachedConfig = result.data;
  return result.data;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
