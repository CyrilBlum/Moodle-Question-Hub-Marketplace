import { getDatabase, closeDatabase } from './connection';
import { CryptoService } from '../services/crypto.service';

export async function runSeeds(): Promise<void> {
  const knex = getDatabase();
  console.log('Starte Datenbank-Seeding...');

  // 1. Initial Teacher User
  const existingUser = await knex('users').where({ email: 'teacher@kanti.ch' }).first();
  const userId = '11111111-2222-3333-4444-555555555555';

  if (!existingUser) {
    const passwordHash = CryptoService.hashPassword('MoodleHub2026!');
    await knex('users').insert({
      id: userId,
      email: 'teacher@kanti.ch',
      password_hash: passwordHash,
      full_name: 'Cyril Wendl',
      institution: 'Kantonsschule Enge',
      canton: 'ZH',
      role: 'teacher',
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log('Standard-Lehrperson angelegt: teacher@kanti.ch / MoodleHub2026!');
  }

  // 2. Default OAuth Client for Moodle Plugins
  const existingClient = await knex('oauth_clients').where({ client_id: 'moodle-plugin-client' }).first();
  if (!existingClient) {
    await knex('oauth_clients').insert({
      client_id: 'moodle-plugin-client',
      client_secret: null, // Public PKCE client
      name: 'Moodle Question Hub Plugin',
      redirect_uris: JSON.stringify([
        'https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php',
        'https://moodle-two.in-form-atik.ch/question/bank/questionhub/callback.php',
        'http://localhost:8080/callback.php',
      ]),
      created_at: new Date(),
    });
    console.log('OAuth-Client angelegt: moodle-plugin-client');
  }

  console.log('Datenbank-Seeding erfolgreich abgeschlossen.');
}

if (require.main === module) {
  runSeeds()
    .then(() => closeDatabase())
    .catch(err => {
      console.error('Fehler bei Datenbank-Seeding:', err);
      process.exit(1);
    });
}
