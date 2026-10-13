import { getConfig } from './config';
import { buildServer } from './server';
import { runMigrations } from './database/migrate';
import { runSeeds } from './database/seed';
import { PackageStorageService } from './services/package-storage.service';
import { closeDatabase } from './database/connection';

async function main(): Promise<void> {
  const config = getConfig();

  // 1. Run migrations and seeds on startup
  try {
    await runMigrations();
    await runSeeds();
  } catch (err) {
    console.error('Fehler bei Datenbankinitialisierung:', err);
  }

  // 2. Initialize storage engine
  const storageService = PackageStorageService.getInstance();
  await storageService.init();

  // 3. Build Fastify application
  const app = await buildServer();

  // 4. Start HTTP listener
  try {
    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`Moodle Question Hub Marketplace läuft auf http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 5. Graceful shutdown handler
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Signal ${signal} empfangen. Beende Server geordnet...`);
      try {
        await app.close();
        await closeDatabase();
        console.log('Server erfolgreich beendet.');
        process.exit(0);
      } catch (err) {
        console.error('Fehler beim Beenden des Servers:', err);
        process.exit(1);
      }
    });
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fataler Fehler beim Serverstart:', err);
    process.exit(1);
  });
}
