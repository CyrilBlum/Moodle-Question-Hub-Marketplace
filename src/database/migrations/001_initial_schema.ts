import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Users Table
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', table => {
      table.string('id', 36).primary();
      table.string('email', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.string('full_name', 150).notNullable();
      table.string('institution', 150).notNullable();
      table.string('canton', 2).notNullable();
      table.string('role', 20).notNullable().defaultTo('teacher');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  // 2. Personal Access Tokens (PAT)
  if (!(await knex.schema.hasTable('personal_access_tokens'))) {
    await knex.schema.createTable('personal_access_tokens', table => {
      table.string('id', 36).primary();
      table.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name', 100).notNullable();
      table.string('token_prefix', 32).notNullable();
      table.string('token_hash', 64).notNullable().unique();
      table.timestamp('last_used_at').nullable();
      table.timestamp('expires_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['token_hash'], 'idx_pat_hash');
    });
  }

  // 3. OAuth Clients
  if (!(await knex.schema.hasTable('oauth_clients'))) {
    await knex.schema.createTable('oauth_clients', table => {
      table.string('client_id', 64).primary();
      table.string('client_secret', 255).nullable();
      table.string('name', 100).notNullable();
      table.text('redirect_uris').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  // 4. OAuth Authorization Codes (PKCE RFC 7636)
  if (!(await knex.schema.hasTable('oauth_auth_codes'))) {
    await knex.schema.createTable('oauth_auth_codes', table => {
      table.string('code', 64).primary();
      table.string('client_id', 64).notNullable();
      table.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('code_challenge', 128).notNullable();
      table.string('code_challenge_method', 10).notNullable().defaultTo('S256');
      table.string('redirect_uri', 512).notNullable();
      table.boolean('used').notNullable().defaultTo(false);
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  // 5. Packages Table
  if (!(await knex.schema.hasTable('packages'))) {
    await knex.schema.createTable('packages', table => {
      table.string('id', 100).primary();
      table.string('owner_id', 36).notNullable().references('id').inTable('users');
      table.string('title', 200).notNullable();
      table.text('summary').notNullable();
      table.string('language', 10).notNullable().defaultTo('de-CH');
      table.string('license', 50).notNullable().defaultTo('CC-BY-4.0');
      table.string('framework', 50).notNullable().defaultTo('CH-EDK-RLP');
      table.string('subject', 100).notNullable();
      table.string('subject_category', 10).notNullable(); // GF, SF, EF, FF
      table.string('topic', 150).nullable();
      table.string('canton', 2).nullable();
      table.string('latest_version', 30).notNullable();
      table.integer('downloads_count').notNullable().defaultTo(0);
      table.boolean('is_monetised').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

      table.index(['subject'], 'idx_packages_subject');
      table.index(['subject_category'], 'idx_packages_subject_cat');
      table.index(['canton'], 'idx_packages_canton');
      table.index(['downloads_count'], 'idx_packages_downloads');
      table.index(['updated_at'], 'idx_packages_updated');
    });
  }

  // 6. Package Grade Levels
  if (!(await knex.schema.hasTable('package_grades'))) {
    await knex.schema.createTable('package_grades', table => {
      table.string('package_id', 100).notNullable().references('id').inTable('packages').onDelete('CASCADE');
      table.string('grade', 10).notNullable();
      table.primary(['package_id', 'grade']);
    });
  }

  // 7. Package Tags
  if (!(await knex.schema.hasTable('package_tags'))) {
    await knex.schema.createTable('package_tags', table => {
      table.string('package_id', 100).notNullable().references('id').inTable('packages').onDelete('CASCADE');
      table.string('tag', 50).notNullable();
      table.primary(['package_id', 'tag']);
    });
  }

  // 8. Releases Table
  if (!(await knex.schema.hasTable('releases'))) {
    await knex.schema.createTable('releases', table => {
      table.string('id', 36).primary();
      table.string('package_id', 100).notNullable().references('id').inTable('packages').onDelete('CASCADE');
      table.string('version', 30).notNullable();
      table.string('sha256', 64).notNullable();
      table.string('file_path', 512).notNullable();
      table.bigInteger('file_size_bytes').notNullable();
      table.integer('question_count').notNullable().defaultTo(0);
      table.text('qtypes_json').notNullable();
      table.text('categories_json').notNullable();
      table.text('release_notes').nullable();
      table.boolean('is_yanked').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.unique(['package_id', 'version'], { indexName: 'uq_pkg_version' });
      table.index(['sha256'], 'idx_releases_sha256');
    });
  }

  // 9. Additive migration: per-package switch for the public preview (default: on).
  if (!(await knex.schema.hasColumn('packages', 'preview_enabled'))) {
    await knex.schema.alterTable('packages', table => {
      table.boolean('preview_enabled').notNullable().defaultTo(true);
    });
  }

  if (!(await knex.schema.hasColumn('packages', 'visibility'))) {
    await knex.schema.alterTable('packages', table => {
      table.string('visibility', 10).notNullable().defaultTo('public');
    });
  }

  if (!(await knex.schema.hasColumn('users', 'profile_role'))) {
    await knex.schema.alterTable('users', table => {
      table.string('profile_role', 100).nullable();
    });
  }

  if (!(await knex.schema.hasTable('package_access_requests'))) {
    await knex.schema.createTable('package_access_requests', table => {
      table.string('id', 36).primary();
      table.string('package_id', 100).notNullable().references('id').inTable('packages').onDelete('CASCADE');
      table.string('requester_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('status', 10).notNullable().defaultTo('pending');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['package_id', 'requester_id'], { indexName: 'uq_package_access_requester' });
      table.index(['package_id', 'status'], 'idx_access_request_package_status');
    });
  }

  // Tombstones of withdrawn packages: the ID keeps answering 410 and cannot be taken over by
  // another account; the owner may only continue above the last version.
  if (!(await knex.schema.hasTable('withdrawn_packages'))) {
    await knex.schema.createTable('withdrawn_packages', table => {
      table.string('id', 100).primary();
      table.string('owner_id', 36).notNullable();
      table.string('last_version', 30).notNullable();
      table.timestamp('withdrawn_at').notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('withdrawn_packages');
  await knex.schema.dropTableIfExists('package_access_requests');
  await knex.schema.dropTableIfExists('releases');
  await knex.schema.dropTableIfExists('package_tags');
  await knex.schema.dropTableIfExists('package_grades');
  await knex.schema.dropTableIfExists('packages');
  await knex.schema.dropTableIfExists('oauth_auth_codes');
  await knex.schema.dropTableIfExists('oauth_clients');
  await knex.schema.dropTableIfExists('personal_access_tokens');
  await knex.schema.dropTableIfExists('users');
}
