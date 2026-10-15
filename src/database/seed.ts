import { getDatabase, closeDatabase } from './connection';
import { CryptoService } from '../services/crypto.service';

export async function runSeeds(): Promise<void> {
  const knex = getDatabase();
  console.log('Starte Datenbank-Seeding...');

  // 1. Test teacher: only when SEED_TEACHER_PASSWORD is set (integration tests). Production does not set it,
  //    so an account deleted in /admin is not re-created on the next start.
  const seedPassword = process.env.SEED_TEACHER_PASSWORD;
  if (seedPassword) {
    const existingUser = await knex('users').where({ email: 'teacher@kanti.ch' }).first();
    if (!existingUser) {
      await knex('users').insert({
        id: '11111111-2222-3333-4444-555555555555',
        email: 'teacher@kanti.ch',
        password_hash: CryptoService.hashPassword(seedPassword),
        full_name: 'Test Lehrperson',
        institution: 'Kantonsschule Enge',
        canton: 'ZH',
        role: 'teacher',
        created_at: new Date(),
        updated_at: new Date(),
      });
      console.log('Test-Lehrperson angelegt: teacher@kanti.ch (Passwort aus SEED_TEACHER_PASSWORD)');
    }
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
