# AGENTS.md – Moodle Question Hub (project knowledge for any coding agent)

Read this first. It is written for Codex, Claude Code, Antigravity and humans alike.
No secrets are stored here: passwords come from environment variables or the owner.

## 1. What this is
Teachers publish Moodle question collections from one Moodle to a shared **Hub** and import them into
another Moodle. Three parts:

| Part | Repo (GitHub, private) | Tech | Where it runs |
|---|---|---|---|
| Moodle plugin `qbank_questionhub` | `CyrilBlum/Moodle-Question-Hub` | PHP, Moodle question-bank subplugin, Mustache | `question/bank/questionhub` on both test Moodles |
| Hub / marketplace (API + web) | `CyrilBlum/Moodle-Question-Hub-Marketplace` (this repo) | Node, TypeScript, Fastify, React/Vite, MariaDB | https://hub.cblum.ch, systemd `moodle-question-hub.service`, nginx -> port 8090 |
| Two test Moodles | not in git | Moodle 5.0.11 (php8.2) and 4.5.15 LTS (php8.1) | https://moodle-one.in-form-atik.ch and https://moodle-two.in-form-atik.ch |

Only `in-form-atik.ch` (with the dash) is owned by the project owner. `in-formatik.ch` was a typo.

Local layout (outside git): `Moodle Question Hub/` contains `moodle-question-hub/` (plugin),
`moodle-question-hub-marketplace/` (Hub + `e2e/`), `FINAL_REPORT.md`, `TEST_INFRA.md`, `TEST_READY.md`,
and an obsolete `tests/` folder (old copy with credentials: delete, never reuse).

## 2. Server (Hetzner, `ssh hetzner`)
- Hub app: `/mnt/HC_Volume_100926434/apps/moodle-question-hub-marketplace` (`dist/`, `node dist/server/index.js`).
  Env file: `/etc/moodle-question-hub/marketplace.env` (DB = MariaDB `questionhub`, `STORAGE_ROOT=/mnt/HC_Volume_100926434/marketplace/packages`).
- Moodle code: `/mnt/HC_Volume_100926434/www/moodle-one` and `.../moodle-two`; data: `/mnt/HC_Volume_100926434/moodledata_{one,two}`.
- Moodle CLI: `php8.2 .../moodle-one/admin/cli/...`, `php8.1 .../moodle-two/admin/cli/...`.
- Backups: `/mnt/HC_Volume_100926434/backups/`. Scratch: `/mnt/HC_Volume_100926434/tmp/` (NOT `/tmp`: it is a 1.5 GB loop mount, also MariaDB tmpdir, and has been full).
- Jobe (CodeRunner sandbox) runs in Docker on port 4000; Moodle curl security allows loopback + port 4000.
  Docker/containerd data lives on the volume (`/var/lib/containerd` is a symlink). Root disk is small: do not write there.
- nginx: `/etc/nginx/sites-available/moodle-{one,two}.in-form-atik.ch`. `location ^~ /dataroot/` must keep `^~`,
  otherwise the static-asset regex location breaks X-Accel-Redirect (icons, files).
- Other workloads share this server (nginx, MariaDB, other sites): never restart MariaDB or nginx casually.

## 3. Architecture facts that are easy to get wrong
- **Hub API** is under `/api/v1` (list returns `{data:[...], pagination}`; NOT `packages`). OAuth lives at `/oauth/*` and `/api/v1/oauth/*`.
- **Releases are immutable SemVer** with SHA-256. Version numbers cannot be edited or reused (withdrawn ones stay blocked).
  Editing = `PATCH /packages/:id` (title, summary, license, grades, tags, preview_enabled, canton, topic, subject).
  Withdrawing = `DELETE /packages/:id` or `/packages/:id/releases/:version`. Own packages: `GET /account/packages`.
- **Preview** can be switched off per package (`preview_enabled`, default true): preview endpoint answers 403 `PREVIEW_DISABLED`,
  the "Vorschau" tag and tab disappear.
- **OAuth** (PKCE, public client `moodle-plugin-client`): `/oauth/authorize` requires a logged-in Hub user (Bearer JWT).
  Browsers without login are redirected to the SPA page `/connect`; API clients get 401. There is no fallback user.
  Registered redirect URIs are in table `oauth_clients` (seeded by `src/database/seed.ts`): the plugin uses
  `.../question/bank/questionhub/oauth_callback.php`. A new Moodle host must be added there.
- **Auth for the plugin**: either OAuth-linked token or a Personal Access Token (`mqh_pat_...`) pasted in the plugin page.
- **XML safety**: DOCTYPE/ENTITY/XInclude are rejected (also UTF-16 with/without BOM via `decodeUpload`), 50 MB package limit.
  Cloze validation only inspects `{n:TYPE:...}` tokens; other braces (LaTeX) are literal.
- **Moodle 5.0 vs 4.5**: on 5.0 questions live in a `mod_qbank` module (default system bank, via
  `question_bank_helper::get_default_open_instance_system_type($course, true)`); on 4.5 they live in the course context.
  Quiz API differs (`process_submit` only on 5.0). CLI scripts need `require_once($CFG->libdir.'/questionlib.php')`.
- **Moodle UI JS**: do not rely on a global `$`/jQuery. Open modals with `data-toggle` + `data-bs-toggle` attributes (BS4 and BS5).
- **Mustache**: output is already escaped. Never run `format_string()` (escaped) into a template variable; use `['escape' => false]`.
- **Hub data**: titles are stored as plain text; the Hub decodes HTML entities on publish/edit.
- **Moodle plugin caching**: after copying plugin files run `purge_caches.php` on that instance.
- **Admin role**: `users.role = 'admin'` (set in the DB after a dump and a dry-run count, or by an admin creating an account).
  The role is read from the DB on every request (`AdminService.isAdmin`), not from the JWT, so a change applies without a new login.
  Admins edit/withdraw any package and use the web page `/admin` with the API under `/api/v1/admin/*`:
  `GET overview` (all accounts, their packages, withdrawn packages), `POST users` (create an account, role teacher or
  admin; without a password a random initial password is returned once and never emailed), `DELETE withdrawn/:id` (final deletion: removes the
  tombstone and frees the ID; Moodles then get 404 instead of 410), `DELETE users/:id` (refused for the own account and for
  accounts that still own active packages; tokens and access requests cascade), `POST users/:id/email` (needs `SMTP_*` in the
  env file, otherwise 503 and the page falls back to a mailto link).
- **Mail**: production sends through Proton SMTP submission as `hub@cblum.ch` (`smtp.protonmail.ch:587`, STARTTLS,
  `SMTP_SECURE=false`; the password is a Proton SMTP token for that address, only in the env file). `cblum.ch` allows only
  Proton in SPF and has DMARC `p=quarantine`, so other senders for `@cblum.ch` would land in spam. After changing the env file:
  `systemctl restart moodle-question-hub` (systemd strips the quotes around `SMTP_FROM`).

## 4. Build and deploy
Hub (this repo):
```bash
npm ci
npm run build                 # dist/client + dist/server
```
Do not run tests or type-checks locally. After building, deploy to Hetzner and verify the live Hub URL and service health there.
This live deployment is the required verification workflow for Hub changes; do not stop after local checks.
Deploy the Hub (production; keep a DB backup and the previous dist for rollback):
```bash
A=/mnt/HC_Volume_100926434/apps/moodle-question-hub-marketplace
rsync -a --delete dist/ hetzner:$A/dist.new/
ssh hetzner "cd $A && mysqldump --single-transaction questionhub > /mnt/HC_Volume_100926434/backups/questionhub-\$(date +%Y%m%d-%H%M).sql \
  && chown -R questionhub:questionhub dist.new && rm -rf dist.bak-prev && mv dist dist.bak-prev && mv dist.new dist \
  && systemctl restart moodle-question-hub && sleep 3 && curl -s localhost:8090/api/v1/health"
# rollback: mv dist dist.failed && mv dist.bak-prev dist && systemctl restart moodle-question-hub
```
Migrations are additive and run on start (`src/database/migrations/001_initial_schema.ts`, idempotent).

Plugin (other repo) to both Moodles:
```bash
rsync -a --exclude .git --exclude tests --exclude .github ./ hetzner:/mnt/HC_Volume_100926434/tmp/qh-new-one/   # and -two
# on the server: back up question/bank/questionhub, rsync into place, chown like a sibling plugin, php -l changed files,
# then purge_caches.php with php8.2 (one) / php8.1 (two). Bump version.php only if db/ or capabilities change.
```
Lint PHP on the server (`php8.2 -l`); there is no PHP on the usual dev laptop.

## 5. E2E suite (`e2e/`, live, not part of CI)
- Run from this repo root: `python3 e2e/e2e_runner.py --tier all` (204 tests, ~4 min). Needs `ssh hetzner`, `pip install -r e2e/requirements.txt`,
  and `e2e/moodle_quiz_harness.php` copied to `/mnt/HC_Volume_100926434/moodle_quiz_harness.php` after every change.
- Credentials via environment only: `QHUB_TEACHER_PASSWORD` (Hub account `c@cblum.ch`, override `QHUB_TEACHER_EMAIL`),
  `QHUB_MOODLE_TEACHER_PASSWORD` (user `teacher1`), `QHUB_M1_ADMIN_PASSWORD`, `QHUB_M2_ADMIN_PASSWORD`.
- Cleanup fixtures delete everything created since the run started on both Moodles (max-ID snapshot) and withdraw the Hub packages
  the teacher account published. **Never run two sessions at once** and never while someone imports real data.
  `QHUB_KEEP_TEST_DATA=1` keeps data for debugging.
- Tests that need the private real question bank skip when `e2e/fixtures/real_dataset/` is missing (git-ignored on purpose).
- The registration tests create throw-away Hub users (`teacher_reg_<ts>@kanti.ch`); they are not cleaned automatically.

## 6. Accounts (no passwords here)
- Hub test teacher and Hub admin: `c@cblum.ch` (`QHUB_TEACHER_PASSWORD`; role `admin` since 2026-10-15). E2E cleanup
  only withdraws the account's own packages, so the admin role does not widen what tests touch.
- `teacher@kanti.ch` (seed account) and throw-away `teacher_reg_*`/`teacher_b_*` accounts still exist on the Hub;
  delete them in `/admin` if no longer needed.
- Moodle: teacher `teacher1`, admins on both instances (ask the owner or use the env vars above).
- A separate agent workflow (repo `Moodle-Questions`, "qbase") imports a private question bank into both Moodles with `cli/import.php`;
  coordinate before touching the instances (its data is real).

## 7. Working rules
- Work directly; do not spawn fleets of sub-agents (earlier Antigravity runs burned credits and over-claimed "100% pass").
- Report what was verified live versus only unit-tested. Do not claim a deploy without checking the live URL.
- Destructive production actions (deleting packages/accounts, DB writes, restarting shared services) need a dry run and a count first.
- Git: work directly on `main` (no feature branches, for simplicity): small commits, push; CI (GitHub Actions) must be green. Do not commit secrets, `real_dataset`, or generated `dist/`.
- Swiss Standard German in student/teacher-facing text: «ss» never «ß»; formal «Sie».

## 8. Known open items (as of 2026-10-14)
- Whole-category publish is a list on the Question Hub page: Moodle's category `…` menu has no plugin hook in 4.5/5.0.
- Not covered by E2E: the plugin's own HTTP client/UI paths (settings editor, withdraw buttons, OAuth consent page), CodeRunner questions.
- Real 270 MB export exceeds the 50 MB package limit by design (265 MB are embedded media).
- MariaDB `tmpdir` is on the small `/tmp` loop mount; moving it needs a MariaDB restart (not done).
- Plugin settings editor, import/preview button fix, entity decoding, private package access, and question type badges are merged into main.
- Drawing and `oumultiresponse` question types are unsupported by the importer (warning `WARN_UNSUPPORTED_QUESTION_TYPE`).
