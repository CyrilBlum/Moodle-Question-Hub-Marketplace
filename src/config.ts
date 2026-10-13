import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

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

  // Pluggable Monetisation
  MONETISATION_ENABLED: z
    .preprocess(val => val === 'true' || val === true || val === '1' || val === 1, z.boolean())
    .default(false),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
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
