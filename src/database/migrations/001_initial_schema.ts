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

  // Optional note of the requester, whether the owner may see their contact details, and the owner's reply.
  if (!(await knex.schema.hasColumn('package_access_requests', 'message'))) {
    await knex.schema.alterTable('package_access_requests', table => {
      table.text('message').nullable();
      table.boolean('share_contact').notNullable().defaultTo(true);
      table.text('response_message').nullable();
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

  // Package roles besides the creator (packages.owner_id, always admin): member = read access to a
  // private package, editor = publish new versions, admin = also settings, members, access requests, withdrawal.
  if (!(await knex.schema.hasTable('package_members'))) {
    await knex.schema.createTable('package_members', table => {
      table.string('package_id', 100).notNullable().references('id').inTable('packages').onDelete('CASCADE');
      table.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('role', 10).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.primary(['package_id', 'user_id']);
      table.index(['user_id'], 'idx_package_members_user');
    });
    // Approved access requests so far granted read access: they become members.
    const approved = await knex('package_access_requests').where({ status: 'approved' }).select('package_id', 'requester_id');
    for (const row of approved) {
      await knex('package_members').insert({ package_id: row.package_id, user_id: row.requester_id, role: 'member' });
    }
  }

  // Optional GitHub link: a user's encrypted GitHub token, the repository a package is mirrored to
  // (with the package admin whose token pushes), and the outcome of each release's commit.
  if (!(await knex.schema.hasColumn('users', 'github_token_enc'))) {
    await knex.schema.alterTable('users', table => {
      table.text('github_token_enc').nullable();
      table.string('github_login', 100).nullable();
      table.timestamp('github_connected_at').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('packages', 'github_repo'))) {
    await knex.schema.alterTable('packages', table => {
      table.string('github_repo', 255).nullable();
      table.string('github_linked_by', 36).nullable();
    });
  }
  if (!(await knex.schema.hasColumn('releases', 'github_commit_url'))) {
    await knex.schema.alterTable('releases', table => {
      table.string('github_commit_url', 512).nullable();
      table.text('github_error').nullable();
    });
  }

  // Forks: the package a fork was copied from, the version of the original its content is based on
  // (moves on with every sync and fully merged merge request) and the original's licence at fork time.
  if (!(await knex.schema.hasColumn('packages', 'forked_from_id'))) {
    await knex.schema.alterTable('packages', table => {
      table.string('forked_from_id', 100).nullable();
      table.string('forked_from_version', 30).nullable();
      table.string('forked_from_license', 50).nullable();
      table.index(['forked_from_id'], 'idx_packages_forked_from');
    });
  }

  // Merge requests from a fork into its original (numbered per target package), with comments,
  // system notes (merged, closed, ...) and approvals.
  // MariaDB: foreign keys need the collation of the referenced tables, which may differ from the database default.
  let collation: string | null = null;
  if (['mysql', 'mysql2'].includes(String(knex.client.config.client))) {
    const [rows] = await knex.raw(
      "SELECT table_collation AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'packages'");
    collation = rows?.[0]?.c || null;
  }
  const sameCollation = (table: Knex.CreateTableBuilder) => {
    if (collation) {
      table.charset(collation.split('_')[0]);
      table.collate(collation);
    }
  };
  if (!(await knex.schema.hasTable('merge_requests'))) {
    await knex.schema.createTable('merge_requests', table => {
      sameCollation(table);
      table.string('id', 36).primary();
      table.string('target_package_id', 100).notNullable().references('id').inTable('packages').onDelete('CASCADE');
      table.integer('number').notNullable();
      table.string('source_package_id', 100).notNullable();
      table.string('author_id', 36).nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('title', 200).notNullable();
      table.text('description').nullable();
      table.string('status', 10).notNullable().defaultTo('open');
      // Filled when merged: what was compared and the resulting version of the target.
      table.string('merge_base_version', 30).nullable();
      table.string('merged_source_version', 30).nullable();
      table.string('merged_target_version', 30).nullable();
      table.string('merged_version', 30).nullable();
      table.string('closed_by', 36).nullable();
      table.timestamp('closed_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['target_package_id', 'number'], { indexName: 'uq_mr_target_number' });
      table.index(['source_package_id'], 'idx_mr_source');
      table.index(['author_id'], 'idx_mr_author');
    });
  }
  if (!(await knex.schema.hasTable('merge_request_notes'))) {
    await knex.schema.createTable('merge_request_notes', table => {
      sameCollation(table);
      table.string('id', 36).primary();
      table.string('merge_request_id', 36).notNullable().references('id').inTable('merge_requests').onDelete('CASCADE');
      table.string('author_id', 36).nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('kind', 10).notNullable().defaultTo('comment');
      table.text('body').notNullable();
      table.string('question_key', 64).nullable();
      table.string('question_name', 255).nullable();
      table.boolean('resolved').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['merge_request_id', 'created_at'], 'idx_mr_notes');
    });
  }
  if (!(await knex.schema.hasTable('merge_request_approvals'))) {
    await knex.schema.createTable('merge_request_approvals', table => {
      sameCollation(table);
      table.string('merge_request_id', 36).notNullable().references('id').inTable('merge_requests').onDelete('CASCADE');
      table.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.primary(['merge_request_id', 'user_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('merge_request_approvals');
  await knex.schema.dropTableIfExists('merge_request_notes');
  await knex.schema.dropTableIfExists('merge_requests');
  await knex.schema.dropTableIfExists('package_members');
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
