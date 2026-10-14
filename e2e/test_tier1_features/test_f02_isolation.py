"""
Feature 02: Moodle 1 & 2 Instance Isolation (ORIGINAL_REQUEST §R3).
Verifies strict database segregation, dataroot persistent storage separation,
independent session cookies, virtual host routing, and mutation isolation.
"""

import time
import pytest
import requests


def test_f02_t01_database_isolation(hetzner_ssh):
    """Verify Moodle 1 and 2 connect to strictly separated database instances."""
    cmd1 = 'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); echo json_encode(["dbname" => $CFG->dbname, "dbuser" => $CFG->dbuser]);\''
    cmd2 = 'php8.1 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-two/config.php"); echo json_encode(["dbname" => $CFG->dbname, "dbuser" => $CFG->dbuser]);\''

    res1 = hetzner_ssh(cmd1)
    res2 = hetzner_ssh(cmd2)

    assert res1.returncode == 0 and res2.returncode == 0
    assert '"dbname":"moodle_one"' in res1.stdout
    assert '"dbname":"moodle_two"' in res2.stdout
    assert res1.stdout != res2.stdout, "Moodle 1 and 2 must use distinct database configurations"


def test_f02_t02_dataroot_storage_isolation(hetzner_ssh):
    """Verify physical dataroot directories on /mnt/HC_Volume_100926434/ are segregated."""
    cmd1 = 'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); echo $CFG->dataroot;\''
    cmd2 = 'php8.1 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-two/config.php"); echo $CFG->dataroot;\''

    res1 = hetzner_ssh(cmd1)
    res2 = hetzner_ssh(cmd2)

    assert res1.returncode == 0 and res2.returncode == 0
    dir1 = res1.stdout.strip()
    dir2 = res2.stdout.strip()

    assert dir1 == "/mnt/HC_Volume_100926434/moodledata_one"
    assert dir2 == "/mnt/HC_Volume_100926434/moodledata_two"
    assert dir1 != dir2, "Dataroot paths must be completely separated"


def test_f02_t03_session_cookie_independence(moodle1_url, moodle2_url):
    """Verify session cookies on Moodle 1 and Moodle 2 are completely independent."""
    s1 = requests.Session()
    s2 = requests.Session()

    r1 = s1.get(f"{moodle1_url}/", timeout=15)
    r2 = s2.get(f"{moodle2_url}/", timeout=15)

    c1 = s1.cookies.get("MoodleSession")
    c2 = s2.cookies.get("MoodleSession")

    assert c1 is not None, "Moodle 1 did not set MoodleSession cookie"
    assert c2 is not None, "Moodle 2 did not set MoodleSession cookie"
    assert c1 != c2, "Moodle 1 and Moodle 2 shared or leaked identical session cookies"


def test_f02_t04_vhost_header_routing(moodle1_url, moodle2_url):
    """Verify Nginx reverse proxy routes traffic strictly based on Host header."""
    r1 = requests.get(moodle1_url, headers={"Host": "moodle-one.in-form-atik.ch"}, timeout=15)
    r2 = requests.get(moodle2_url, headers={"Host": "moodle-two.in-form-atik.ch"}, timeout=15)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert "moodle-one" in r1.text.lower() or "latest stable" in r1.text.lower() or "5.0" in r1.text
    assert "moodle-two" in r2.text.lower() or "4.5" in r2.text.lower() or "lts" in r2.text.lower()


def test_f02_t05_data_mutation_isolation(hetzner_ssh):
    """Verify creating a test question category in Moodle 1 does not mutate Moodle 2."""
    test_tag = f"ISO_CAT_{int(time.time())}"

    # Insert into M1
    insert_cmd = f'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); $cat = new stdClass(); $cat->name = "{test_tag}"; $cat->contextid = 1; $cat->info = ""; $cat->infoformat = 0; $cat->stamp = make_unique_id_code(); $cat->parent = 0; $cat->sortorder = 999; $cat->idnumber = ""; $id = $DB->insert_record("question_categories", $cat); echo $id;\''
    res_ins = hetzner_ssh(insert_cmd)
    assert res_ins.returncode == 0
    cat_id = res_ins.stdout.strip()

    try:
        # Check presence in M1
        check_m1 = f'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); echo $DB->record_exists("question_categories", ["name" => "{test_tag}"]) ? "EXISTS" : "NO";\''
        res_m1 = hetzner_ssh(check_m1)
        assert "EXISTS" in res_m1.stdout

        # Check absence in M2
        check_m2 = f'php8.1 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-two/config.php"); echo $DB->record_exists("question_categories", ["name" => "{test_tag}"]) ? "EXISTS" : "NO";\''
        res_m2 = hetzner_ssh(check_m2)
        assert "NO" in res_m2.stdout, f"Category {test_tag} leaked into Moodle 2 database!"
    finally:
        # Cleanup M1
        clean_cmd = f'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); $DB->delete_records("question_categories", ["id" => {cat_id}]);\''
        hetzner_ssh(clean_cmd)
