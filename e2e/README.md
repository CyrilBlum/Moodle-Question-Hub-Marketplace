# End-to-End-Tests (live)

Opaque-box test suite for Moodle Question Hub. It runs against the **live** testbed:
the marketplace (`hub.cblum.ch`), Moodle One (5.0) and Moodle Two (4.5 LTS) on the Hetzner server.
It is therefore not part of CI (`npm test` runs the unit and integration tests).

## Prerequisites
- `ssh hetzner` works (the suite runs PHP on the testbed via SSH).
- `pip install -r e2e/requirements.txt`
- `e2e/moodle_quiz_harness.php` is deployed to `/mnt/HC_Volume_100926434/moodle_quiz_harness.php`
  (`scp` it again after every change).

## Credentials (environment, never committed)
| Variable | Purpose |
|---|---|
| `QHUB_TEACHER_PASSWORD` | Hub teacher account (`QHUB_TEACHER_EMAIL`, default `c@cblum.ch`) |
| `QHUB_MOODLE_TEACHER_PASSWORD` | Moodle teacher (`QHUB_MOODLE_TEACHER_USER`, default `teacher1`) |
| `QHUB_M1_ADMIN_PASSWORD` / `QHUB_M2_ADMIN_PASSWORD` | Moodle admin accounts |

## Run
```bash
python3 e2e/e2e_runner.py --tier all      # or --tier 1|2|3|4
```
Tiers: 1 feature coverage (F01-F15), 2 boundaries and attacks, 3 cross-feature combinations,
4 Swiss Gymnasium scenarios incl. live quiz attempts on both Moodle versions.

## Test data cleanup
A session fixture (`conftest.py`) records the highest question, category and quiz IDs on both
Moodles before the run and deletes everything newer afterwards. Consequences:
- Do **not** run two sessions at the same time; one would delete the other's data.
- `QHUB_KEEP_TEST_DATA=1` keeps the data for debugging.

## Private real-dataset fixtures
Tests that use subsets of a real question bank skip when `e2e/fixtures/real_dataset/` is missing
(that folder is git-ignored, because the questions are private). To create the subsets, set
`QHUB_REAL_DB_XML` to a Moodle XML export and run `generate_fixtures.py`. The server-side copies live
under `/mnt/HC_Volume_100926434/real_dataset/`.
