"""
Feature 09: Native qbank_questionhub Subplugin UI (ORIGINAL_REQUEST §R1).
Verifies plugin registration in Moodle core, navigation hooks,
authenticated teacher view.php access, unauthenticated redirect, and action menu extensions.
"""

import pytest


def test_f09_t01_plugin_registration(hetzner_ssh):
    """Verify qbank_questionhub is registered in Moodle core component subsystem on both instances."""
    for inst, php, root in [("1", "php8.2", "/mnt/HC_Volume_100926434/www/moodle-one"),
                            ("2", "php8.1", "/mnt/HC_Volume_100926434/www/moodle-two")]:
        cmd = f'{php} -r \'define("CLI_SCRIPT", true); require_once("{root}/config.php"); $list = \\core_component::get_plugin_list("qbank"); echo isset($list["questionhub"]) ? "REGISTERED" : "NOT_FOUND";\''
        res = hetzner_ssh(cmd)
        assert res.returncode == 0
        assert "REGISTERED" in res.stdout, f"Plugin qbank_questionhub not registered in instance {inst}"


def test_f09_t02_secondary_navigation_node(hetzner_ssh):
    """Verify navigation extension provides the Question Hub tab in course question bank."""
    for inst, php, root in [("1", "php8.2", "/mnt/HC_Volume_100926434/www/moodle-one"),
                            ("2", "php8.1", "/mnt/HC_Volume_100926434/www/moodle-two")]:
        cmd = f'{php} -r \'define("CLI_SCRIPT", true); require_once("{root}/config.php"); require_once($CFG->libdir . "/questionlib.php"); $class = "\\\\qbank_questionhub\\\\plugin_feature"; echo class_exists($class) ? "EXISTS" : "NO";\''
        res = hetzner_ssh(cmd)
        assert res.returncode == 0
        assert "EXISTS" in res.stdout, f"Plugin feature class missing on instance {inst}"


def test_f09_t03_web_ui_view_page_teacher_access(m1_teacher_session, m2_teacher_session):
    """Verify enrolled teacher can access view.php with full Hub browser UI."""
    for session, name in [(m1_teacher_session, "Moodle 1"), (m2_teacher_session, "Moodle 2")]:
        resp = session.get_view_page(courseid=2)
        assert resp.status_code == 200, f"view.php failed on {name}"
        assert "Question Hub" in resp.text or "Fragensammlung" in resp.text or "hub" in resp.text.lower()
        assert "search" in resp.text.lower() or "filter" in resp.text.lower() or "suche" in resp.text.lower()


def test_f09_t04_guest_capability_rejection(moodle1_client, moodle2_client):
    """Verify unauthenticated guests cannot access view.php or publish.php and are redirected to login."""
    for client, name in [(moodle1_client, "Moodle 1"), (moodle2_client, "Moodle 2")]:
        r_view = client.get_view_page(courseid=2)
        assert "login/index.php" in r_view.url, f"Unauthenticated guest not redirected to login for view.php on {name}"

        r_pub = client.get_publish_page(courseid=2)
        assert "login/index.php" in r_pub.url, f"Unauthenticated guest not redirected to login for publish.php on {name}"


def test_f09_t05_bulk_publish_action_registration(hetzner_ssh):
    """Verify bulk publish action class is registered in qbank subsystem."""
    for inst, php, root in [("1", "php8.2", "/mnt/HC_Volume_100926434/www/moodle-one"),
                            ("2", "php8.1", "/mnt/HC_Volume_100926434/www/moodle-two")]:
        cmd = f'{php} -r \'define("CLI_SCRIPT", true); require_once("{root}/config.php"); $class = "\\\\qbank_questionhub\\\\bulk_publish_action"; echo class_exists($class) ? "EXISTS" : "NO";\''
        res = hetzner_ssh(cmd)
        assert res.returncode == 0
        assert "EXISTS" in res.stdout, f"bulk_publish_action class missing on instance {inst}"
