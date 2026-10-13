import { getDatabase, closeDatabase } from './connection';
import * as initialSchema from './migrations/001_initial_schema';

export async function runMigrations(): Promise<void> {
  const knex = getDatabase();
  console.log('Führe Datenbank-Migrationen aus...');
  await initialSchema.up(knex);
  console.log('Datenbank-Migrationen erfolgreich abgeschlossen.');
}

if (require.main === module) {
  runMigrations()
    .then(() => closeDatabase())
    .catch(err => {
      console.error('Fehler bei Datenbank-Migration:', err);
      process.exit(1);
    });
}
