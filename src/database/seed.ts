import { randomBytes } from 'crypto';
import { getDatabase, closeDatabase } from './connection';
import { CryptoService } from '../services/crypto.service';

export async function runSeeds(): Promise<void> {
  const knex = getDatabase();
  console.log('Starte Datenbank-Seeding...');

  // 1. Initial Teacher User
  const existingUser = await knex('users').where({ email: 'teacher@kanti.ch' }).first();
  const userId = '11111111-2222-3333-4444-555555555555';

  if (!existingUser) {
    // The seed password comes from the environment; without it a random one is generated and shown once.
    const seedPassword = process.env.SEED_TEACHER_PASSWORD || randomBytes(18).toString('base64url');
    const passwordHash = CryptoService.hashPassword(seedPassword);
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
    if (process.env.SEED_TEACHER_PASSWORD) {
      console.log('Standard-Lehrperson angelegt: teacher@kanti.ch (Passwort aus SEED_TEACHER_PASSWORD)');
    } else {
      console.log(`Standard-Lehrperson angelegt: teacher@kanti.ch / ${seedPassword} (einmalig angezeigt)`);
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
