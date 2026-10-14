"""
Tier 4 Scenario 1: Informatik GF (SEK II ZH) — Algorithmen und Datenstrukturen.
Curriculum: Lehrplan SEK II Kanton Zuerich, Grundlagenfach Informatik.
Workload: 25 Questions covering all 7 standard question types with embedded binary tree SVG diagram.
Verifies:
1. Hub preflight validation & question types breakdown (all 7 core types present).
2. Marketplace publication with Swiss Gymnasium taxonomy (canton: ZH, subject: Informatik, level: GF).
3. Download release integrity and SHA-256 checksum verification.
4. Cross-version Moodle import into Course 2 and embedded SVG media preservation.
5. Ingestion of the real-world production question database standard subset (real_standard_subset.xml).
6. Live student quiz attempt submission and automated grading via moodle_quiz_harness.php scored 100%.
"""

import os
import time
import json
import hashlib
import base64
import pytest


SCENARIO_XML_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "packages", "scenario_cs_algorithms_25q.xml")
)


def test_cs_algo_package_preflight_and_breakdown(hub_client, teacher_jwt):
    """Verify CS scenario package passes Hub preflight diagnostics with all 7 question types."""
    hub_client.set_token(teacher_jwt)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200, f"Preflight failed: {resp.text}"
    data = resp.json()
    assert data.get("valid") is True
    stats = data.get("stats", {})
    assert stats.get("question_count") == 25

    breakdown = stats.get("qtypes_breakdown", {})
    expected_types = ["multichoice", "truefalse", "shortanswer", "numerical", "matching", "cloze", "essay"]
    for qtype in expected_types:
        assert qtype in breakdown, f"Missing question type '{qtype}' in breakdown: {breakdown}"
        assert breakdown[qtype] >= 1


def test_cs_algo_marketplace_publish_and_verify(hub_client, teacher_jwt):
    """Publish CS package to central Marketplace with SEK II ZH taxonomy and verify download."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    package_id = f"ch.gym.zh.inf.algorithms.{ts}"
    version = "1.0.0"

    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    metadata = {
        "id": package_id,
        "version": version,
        "title": f"Informatik GF Algorithmen {ts}",
        "summary": "Gymnasium Zuerich Grundlagenfach Informatik Pruefungspaket mit 25 Aufgaben",
        "language": "de-CH",
        "taxonomy": {
            "subject": "Informatik",
            "level": "GF",
            "canton": "ZH"
        }
    }

    pub_resp = hub_client.publish_package(metadata, xml_content)
    assert pub_resp.status_code == 201, f"Publish failed: {pub_resp.text}"
    pub_data = pub_resp.json()
    assert (pub_data.get("package_id") or pub_data.get("id")) == package_id
    expected_sha256 = pub_data.get("sha256")

    # Download and verify SHA-256 checksum
    dl_resp = hub_client.download_release(package_id, version)
    assert dl_resp.status_code == 200
    actual_sha256 = hashlib.sha256(dl_resp.content).hexdigest()
    assert actual_sha256 == expected_sha256, f"SHA-256 mismatch: {actual_sha256} vs {expected_sha256}"


def test_cs_algo_moodle_import_and_media_preservation(remote_php):
    """Import CS package into Moodle 2 (4.5 LTS) and verify question bank hydration and SVG diagram."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    # Prefix question names with dynamic timestamp to avoid collisions
    custom_xml = raw_xml.replace("<name><text>CS_", f"<name><text>CS_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    // Query imported primary questions (parent = 0 excludes Cloze/Match subquestions)
    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'CS_{ts}%']
    );

    // Check SVG file in Moodle files table
    $files = $DB->get_records_sql(
        "SELECT id, filename, mimetype, filesize FROM {{files}} WHERE component = 'question' AND filename = 'binary_tree.svg' ORDER BY id DESC LIMIT 1"
    );
    $svgfile = reset($files);

    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'db_count' => count($questions),
        'has_svg' => !empty($svgfile),
        'svg_mime' => $svgfile ? $svgfile->mimetype : null
    ]);
    """
    res = remote_php(php_code, php_bin="php8.1")
    assert res.returncode == 0, f"Import PHP execution failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 25
    assert data["db_count"] == 25
    assert data["has_svg"] is True
    assert data["svg_mime"] == "image/svg+xml"


def test_cs_algo_real_dataset_standard_subset_import(remote_php):
    """Import the real-world question database standard subset into Moodle 1 (5.0)."""
    dataset_path = "/mnt/HC_Volume_100926434/real_dataset/real_standard_subset.xml"
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    if (!file_exists('{dataset_path}')) {{
        echo json_encode(['error' => 'Dataset file not found']);
        exit(1);
    }}
    $xml = file_get_contents('{dataset_path}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Real dataset import failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] >= 20, f"Expected at least 20 real standard questions imported, got {data['count']}"


def test_cs_algo_live_quiz_attempt_100_percent(remote_php, hetzner_ssh):
    """Execute live student attempt on imported CS questions and verify 100% score via CLI quiz harness."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>CS_", f"<name><text>CS_ATT_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    # 1. Import questions into Moodle 1
    import_php = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    // Retrieve specific question IDs for testing
    $q_tf = $DB->get_record('question', ['name' => 'CS_ATT_{ts}_Q06_Binaerbaum_Maximale_Hoehe'], 'id', MUST_EXIST);
    $q_num = $DB->get_record('question', ['name' => 'CS_ATT_{ts}_Q13_Knotenanzahl_Hoehe_4'], 'id', MUST_EXIST);
    $q_sa = $DB->get_record('question', ['name' => 'CS_ATT_{ts}_Q09_Inorder_Reihenfolge'], 'id', MUST_EXIST);

    echo json_encode([
        'tf_id' => (int)$q_tf->id,
        'num_id' => (int)$q_num->id,
        'sa_id' => (int)$q_sa->id
    ]);
    """
    res_import = remote_php(import_php, php_bin="php8.2")
    assert res_import.returncode == 0
    qids_data = json.loads(res_import.stdout[res_import.stdout.find("{"):])
    tf_id = qids_data["tf_id"]
    num_id = qids_data["num_id"]
    sa_id = qids_data["sa_id"]

    # 2. Create quiz with the 3 questions
    quiz_payload = json.dumps({
        "courseid": 2,
        "quizname": f"Klausur Informatik Algorithmen {ts}",
        "questionids": [tf_id, num_id, sa_id]
    })
    c_res = hetzner_ssh(
        f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one create_and_populate_quiz '{quiz_payload}'"
    )
    assert c_res.returncode == 0, f"Quiz creation failed: {c_res.stderr}\n{c_res.stdout}"
    c_data = json.loads(c_res.stdout[c_res.stdout.find("{"):])
    quizid = c_data["quizid"]
    cmid = c_data["cmid"]

    try:
        # 3. Submit student attempt with 100% correct answers
        # Slot 1: TF Q06 -> answer = "1" (true)
        # Slot 2: NUM Q13 -> answer = "31"
        # Slot 3: SA Q09 -> answer = "aufsteigend"
        att_payload = json.dumps({
            "quizid": quizid,
            "userid": 4,
            "answers": {
                "1": {"answer": "1"},
                "2": {"answer": "31"},
                "3": {"answer": "aufsteigend"}
            }
        })
        att_res = hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one execute_attempt '{att_payload}'"
        )
        assert att_res.returncode == 0, f"Quiz attempt execution failed: {att_res.stderr}\n{att_res.stdout}"
        att_data = json.loads(att_res.stdout[att_res.stdout.find("{"):])
        assert att_data["status"] == "ok"
        assert att_data["is_finished"] is True
        assert att_data["totalfraction"] == 3.0, f"Expected total fraction 3.0, got: {att_data['totalfraction']}"
        assert att_data["slots"]["1"]["state"] == "gradedright"
        assert att_data["slots"]["2"]["state"] == "gradedright"
        assert att_data["slots"]["3"]["state"] == "gradedright"
    finally:
        # 4. Clean up quiz
        clean_payload = json.dumps({"cmid": cmid})
        hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one cleanup_quiz '{clean_payload}'"
        )
