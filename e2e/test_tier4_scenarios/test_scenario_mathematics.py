"""
Tier 4 Scenario 3: Mathematik GF (SEK II AG) — Differential- und Integralrechnung.
Curriculum: Lehrplan SEK II Kanton Aargau, Grundlagenfach Mathematik.
Workload: 18 Questions featuring KaTeX/LaTeX formulas, Numerical tolerances, and calculus essays.
Verifies:
1. Hub preflight validation & breakdown (18 questions, numerical, multichoice, cloze, etc.).
2. Marketplace publication with Swiss Gymnasium taxonomy (canton: AG, subject: Mathematik, level: GF).
3. Download release integrity and SHA-256 checksum verification.
4. Moodle 1 (5.0 Stable) import and KaTeX mathematical notation fidelity in questiontext.
5. Cross-version import into Moodle 2 (4.5 LTS) verifying consistent parsing across Moodle engines.
6. Live student quiz attempt testing numerical tolerance compliance (+-0.05) and automated grading scored 100%.
"""

import os
import time
import json
import hashlib
import base64
import pytest


SCENARIO_XML_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "packages", "scenario_mathematics_18q.xml")
)


def test_math_package_preflight_and_breakdown(hub_client, teacher_jwt):
    """Verify Mathematics scenario package passes Hub preflight diagnostics with 18 questions."""
    hub_client.set_token(teacher_jwt)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200, f"Preflight failed: {resp.text}"
    data = resp.json()
    assert data.get("valid") is True
    stats = data.get("stats", {})
    assert stats.get("question_count") == 18

    breakdown = stats.get("qtypes_breakdown", {})
    assert breakdown.get("numerical") == 4
    assert breakdown.get("multichoice") == 4
    assert breakdown.get("truefalse") == 3
    assert breakdown.get("shortanswer") == 3
    assert breakdown.get("cloze") == 2
    assert breakdown.get("essay") == 2


def test_math_marketplace_publish_and_verify(hub_client, teacher_jwt):
    """Publish Mathematics package to central Marketplace with SEK II AG taxonomy and verify download."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    package_id = f"ch.gym.ag.mat.analysis.{ts}"
    version = "1.0.0"

    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    metadata = {
        "id": package_id,
        "version": version,
        "title": f"Mathematik GF Analysis {ts}",
        "summary": "Gymnasium Aargau Grundlagenfach Mathematik Pruefungspaket mit 18 Aufgaben",
        "language": "de-CH",
        "taxonomy": {
            "subject": "Mathematik",
            "level": "GF",
            "canton": "AG"
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


def test_math_moodle_import_and_latex_preservation(remote_php):
    """Import Math package into Moodle 1 (5.0) and verify LaTeX formula delimiters are intact."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>MATH_", f"<name><text>MATH_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype, questiontext FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'MATH_{ts}%']
    );

    // Verify LaTeX notation in MATH_Q01
    $q01 = $DB->get_record('question', ['name' => 'MATH_{ts}_Q01_Integral_Sinus_Flaeche', 'parent' => 0], 'id, questiontext');
    $has_latex = $q01 && strpos($q01->questiontext, '\\\\( f(x) = \\\\sin(x) \\\\)') !== false;

    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'db_count' => count($questions),
        'has_latex' => $has_latex,
        'sample_text' => $q01 ? substr($q01->questiontext, 0, 80) : null
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Import PHP execution failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 18
    assert data["db_count"] == 18
    assert data["has_latex"] is True


def test_math_cross_instance_import_m2(remote_php):
    """Import Math package into Moodle 2 (4.5 LTS) verifying identical 18 questions hydration."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>MATH_", f"<name><text>MATH_M2_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'MATH_M2_{ts}%']
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
    assert data["count"] == 18
    assert data["db_count"] == 18


def test_math_live_quiz_numerical_tolerance_and_grading(remote_php, hetzner_ssh):
    """Verify numerical answer tolerance evaluation (+-0.05) and automated grading in live quiz."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>MATH_", f"<name><text>MATH_ATT_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    # 1. Import questions into Moodle 1
    import_php = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $q_num1 = $DB->get_record('question', ['name' => 'MATH_ATT_{ts}_Q01_Integral_Sinus_Flaeche', 'parent' => 0], 'id', MUST_EXIST);
    $q_num2 = $DB->get_record('question', ['name' => 'MATH_ATT_{ts}_Q02_Tangentensteigung_Exp', 'parent' => 0], 'id', MUST_EXIST);
    $q_tf = $DB->get_record('question', ['name' => 'MATH_ATT_{ts}_Q09_Differenzierbarkeit_Impliziert_Stetigkeit', 'parent' => 0], 'id', MUST_EXIST);

    echo json_encode([
        'num1_id' => (int)$q_num1->id,
        'num2_id' => (int)$q_num2->id,
        'tf_id' => (int)$q_tf->id
    ]);
    """
    res_import = remote_php(import_php, php_bin="php8.2")
    assert res_import.returncode == 0
    qids_data = json.loads(res_import.stdout[res_import.stdout.find("{"):])
    num1_id = qids_data["num1_id"]
    num2_id = qids_data["num2_id"]
    tf_id = qids_data["tf_id"]

    # 2. Create quiz with the 3 questions
    quiz_payload = json.dumps({
        "courseid": 2,
        "quizname": f"Klausur Analysis und Kurvendiskussion {ts}",
        "questionids": [num1_id, num2_id, tf_id]
    })
    c_res = hetzner_ssh(
        f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one create_and_populate_quiz '{quiz_payload}'"
    )
    assert c_res.returncode == 0
    c_data = json.loads(c_res.stdout[c_res.stdout.find("{"):])
    quizid = c_data["quizid"]
    cmid = c_data["cmid"]

    try:
        # 3. Submit responses within tolerance intervals:
        # Q01 target: 2.0, tolerance: +-0.05 -> submit "2.03" (should be accepted as gradedright)
        # Q02 target: -0.6065, tolerance: +-0.01 -> submit "-0.61" (should be accepted as gradedright)
        # Q09 target: true -> submit "1"
        att_payload = json.dumps({
            "quizid": quizid,
            "userid": 4,
            "answers": {
                "1": {"answer": "2.03"},
                "2": {"answer": "-0.61"},
                "3": {"answer": "1"}
            }
        })
        att_res = hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one execute_attempt '{att_payload}'"
        )
        assert att_res.returncode == 0
        att_data = json.loads(att_res.stdout[att_res.stdout.find("{"):])
        assert att_data["status"] == "ok"
        assert att_data["is_finished"] is True
        assert att_data["totalfraction"] == 3.0, f"Expected total fraction 3.0 with tolerances, got: {att_data['totalfraction']}"
        assert att_data["slots"]["1"]["state"] == "gradedright"
        assert att_data["slots"]["2"]["state"] == "gradedright"
        assert att_data["slots"]["3"]["state"] == "gradedright"
    finally:
        clean_payload = json.dumps({"cmid": cmid})
        hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one cleanup_quiz '{clean_payload}'"
        )
