"""
Tier 4 Scenario 5: Physik EF (SEK II SG) — Klassische Mechanik und Schwingungen.
Curriculum: Lehrplan SEK II Kanton St. Gallen, Ergaenzungsfach Physik.
Workload: 16 Questions featuring SI units, Numerical tolerances, and diagnostic warning probes (STACK and rounding).
Verifies:
1. Hub preflight validation & diagnostic warning detection (WARN_UNSUPPORTED_QUESTION_TYPE, WARN_MULTIPLE_CHOICE_FRACTIONS_SUM).
2. Marketplace publication with Swiss Gymnasium taxonomy (canton: SG, subject: Physik, level: EF).
3. Download release integrity and SHA-256 checksum verification.
4. Moodle 1 (5.0 Stable) import and SI unit matching question preservation.
5. Cross-version import into Moodle 2 (4.5 LTS) verifying consistent question creation.
6. Live student quiz attempt testing SI numerical tolerances and automated grading scored 100%.
"""

import os
import time
import json
import hashlib
import base64
import pytest


SCENARIO_16Q_XML_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "packages", "scenario_physics_16q.xml")
)

SCENARIO_STD_XML_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "packages", "scenario_physics_standard_14q.xml")
)


def test_phys_package_preflight_and_diagnostics(hub_client, teacher_jwt):
    """Verify Physics package passes preflight with valid:true and triggers actionable diagnostics."""
    hub_client.set_token(teacher_jwt)
    with open(SCENARIO_16Q_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200, f"Preflight failed: {resp.text}"
    data = resp.json()
    assert data.get("valid") is True
    stats = data.get("stats", {})
    assert stats.get("question_count") == 16

    breakdown = stats.get("qtypes_breakdown", {})
    assert breakdown.get("numerical") == 4
    assert breakdown.get("multichoice") == 4
    assert breakdown.get("truefalse") == 3
    assert breakdown.get("shortanswer") == 2
    assert breakdown.get("matching") == 2
    assert breakdown.get("stack") == 1

    # Verify diagnostic warnings for non-standard qtype and rounding
    warnings = [w.get("code") for w in data.get("diagnostics", {}).get("warnings", [])]
    assert "WARN_UNSUPPORTED_QUESTION_TYPE" in warnings
    assert "WARN_MULTIPLE_CHOICE_FRACTIONS_SUM" in warnings


def test_phys_marketplace_publish_and_verify(hub_client, teacher_jwt):
    """Publish Physics package to central Marketplace with SEK II SG taxonomy and verify download."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    package_id = f"ch.gym.sg.phy.mechanik.{ts}"
    version = "1.0.0"

    with open(SCENARIO_16Q_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    metadata = {
        "id": package_id,
        "version": version,
        "title": f"Physik EF Mechanik {ts}",
        "summary": "Gymnasium St. Gallen Ergaenzungsfach Physik Pruefungspaket mit 16 Aufgaben",
        "language": "de-CH",
        "taxonomy": {
            "subject": "Physik",
            "level": "EF",
            "canton": "SG"
        }
    }

    pub_resp = hub_client.publish_package(metadata, xml_content)
    assert pub_resp.status_code == 201, f"Publish failed: {pub_resp.text}"
    pub_data = pub_resp.json()
    assert (pub_data.get("package_id") or pub_data.get("id")) == package_id
    expected_sha256 = pub_data.get("sha256")

    dl_resp = hub_client.download_release(package_id, version)
    assert dl_resp.status_code == 200
    actual_sha256 = hashlib.sha256(dl_resp.content).hexdigest()
    assert actual_sha256 == expected_sha256, f"SHA-256 mismatch: {actual_sha256} vs {expected_sha256}"


def test_phys_moodle_import_and_si_units(remote_php):
    """Import standard Physics questions into Moodle 1 (5.0) and verify SI units matching question."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_STD_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>PHYS_", f"<name><text>PHYS_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'PHYS_{ts}%']
    );

    // Verify SI units matching subquestions
    $match_q = $DB->get_record('question', ['name' => 'PHYS_{ts}_Q13_SI_Basiseinheiten_Zuordnung', 'parent' => 0], 'id', MUST_EXIST);
    $subs = $DB->get_records('qtype_match_subquestions', ['questionid' => $match_q->id]);

    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'db_count' => count($questions),
        'match_subs_count' => count($subs)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Import PHP execution failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 14
    assert data["db_count"] == 14
    assert data["match_subs_count"] == 4


def test_phys_cross_instance_import_m2(remote_php):
    """Import standard Physics questions into Moodle 2 (4.5 LTS) verifying consistent question creation."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_STD_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>PHYS_", f"<name><text>PHYS_M2_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'PHYS_M2_{ts}%']
    );

    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'db_count' => count($questions)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.1")
    assert res.returncode == 0, f"M2 Import failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 14
    assert data["db_count"] == 14


def test_phys_live_quiz_numerical_si_units_and_grading(remote_php, hetzner_ssh):
    """Verify SI numerical answers tolerance evaluation and automated grading in live quiz."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_STD_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>PHYS_", f"<name><text>PHYS_ATT_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    # 1. Import questions into Moodle 1
    import_php = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $q_num1 = $DB->get_record('question', ['name' => 'PHYS_ATT_{ts}_Q01_Kinetische_Energie_Freier_Fall', 'parent' => 0], 'id', MUST_EXIST);
    $q_num2 = $DB->get_record('question', ['name' => 'PHYS_ATT_{ts}_Q02_Fadenpendel_Periodendauer', 'parent' => 0], 'id', MUST_EXIST);
    $q_sa = $DB->get_record('question', ['name' => 'PHYS_ATT_{ts}_Q11_SI_Einheit_Kraft', 'parent' => 0], 'id', MUST_EXIST);

    echo json_encode([
        'num1_id' => (int)$q_num1->id,
        'num2_id' => (int)$q_num2->id,
        'sa_id' => (int)$q_sa->id
    ]);
    """
    res_import = remote_php(import_php, php_bin="php8.2")
    assert res_import.returncode == 0
    qids_data = json.loads(res_import.stdout[res_import.stdout.find("{"):])
    num1_id = qids_data["num1_id"]
    num2_id = qids_data["num2_id"]
    sa_id = qids_data["sa_id"]

    # 2. Create quiz with the 3 questions
    quiz_payload = json.dumps({
        "courseid": 2,
        "quizname": f"Klausur Physik Mechanik und Schwingungen {ts}",
        "questionids": [num1_id, num2_id, sa_id]
    })
    c_res = hetzner_ssh(
        f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one create_and_populate_quiz '{quiz_payload}'"
    )
    assert c_res.returncode == 0
    c_data = json.loads(c_res.stdout[c_res.stdout.find("{"):])
    quizid = c_data["quizid"]
    cmid = c_data["cmid"]

    try:
        # 3. Submit responses:
        # Q01 target: 122.625 J, tol: 0.5 -> submit "122.6"
        # Q02 target: 2.006 s, tol: 0.02 -> submit "2.01"
        # Q11 target: Newton -> submit "Newton"
        att_payload = json.dumps({
            "quizid": quizid,
            "userid": 4,
            "answers": {
                "1": {"answer": "122.6"},
                "2": {"answer": "2.01"},
                "3": {"answer": "Newton"}
            }
        })
        att_res = hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one execute_attempt '{att_payload}'"
        )
        assert att_res.returncode == 0
        att_data = json.loads(att_res.stdout[att_res.stdout.find("{"):])
        assert att_data["status"] == "ok"
        assert att_data["is_finished"] is True
        assert att_data["totalfraction"] == 3.0, f"Expected total fraction 3.0, got: {att_data['totalfraction']}"
        assert att_data["slots"]["1"]["state"] == "gradedright"
        assert att_data["slots"]["2"]["state"] == "gradedright"
        assert att_data["slots"]["3"]["state"] == "gradedright"
    finally:
        clean_payload = json.dumps({"cmid": cmid})
        hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one cleanup_quiz '{clean_payload}'"
        )
