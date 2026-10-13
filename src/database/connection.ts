import knex, { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import { getConfig, AppConfig } from '../config';

let dbInstance: Knex | null = null;

export function createDatabaseConnection(configOverrides?: Partial<AppConfig>): Knex {
  const config = configOverrides ? { ...getConfig(), ...configOverrides } : getConfig();

  if (config.DB_DIALECT === 'sqlite') {
    let filename = config.DB_SQLITE_PATH;
    if (filename !== ':memory:') {
      const resolved = path.resolve(filename);
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      filename = resolved;
    }

    return knex({
      client: 'better-sqlite3',
      connection: {
        filename,
      },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1, // SQLite operates best in single connection per process mode
      },
    });
  }

  // MariaDB / MySQL configuration
  return knex({
    client: 'mysql2',
    connection: {
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      charset: 'utf8mb4',
    },
    pool: {
      min: 2,
      max: 10,
    },
  });
}

export function getDatabase(): Knex {
  if (!dbInstance) {
    dbInstance = createDatabaseConnection();
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
  }
}
