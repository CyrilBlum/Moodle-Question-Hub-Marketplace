"""
Tier 4 Scenario 2: Biologie SF (SEK II BE) — Molekulargenetik und Zellbiologie.
Curriculum: Lehrplan SEK II Kanton Bern, Schwerpunktfach Biologie.
Workload: 20 Questions with genetics diagram, Cloze multi-answers, matching, and cell organelles.
Verifies:
1. Hub preflight validation & question counts (20 questions, 7 question types).
2. Marketplace publication with Swiss Gymnasium taxonomy (canton: BE, subject: Biologie, level: SF).
3. Download release integrity and SHA-256 checksum verification.
4. Moodle 1 (5.0 Stable) import, question bank hydration, and media file preservation.
5. Child subquestion hydration for Cloze and Matching questions.
6. Live student quiz attempt submission and automated grading via moodle_quiz_harness.php scored 100%.
"""

import os
import time
import json
import hashlib
import base64
import pytest


SCENARIO_XML_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "packages", "scenario_biology_20q.xml")
)


def test_bio_package_preflight_and_breakdown(hub_client, teacher_jwt):
    """Verify Biology scenario package passes Hub preflight diagnostics with 20 questions."""
    hub_client.set_token(teacher_jwt)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200, f"Preflight failed: {resp.text}"
    data = resp.json()
    assert data.get("valid") is True
    stats = data.get("stats", {})
    assert stats.get("question_count") == 20

    breakdown = stats.get("qtypes_breakdown", {})
    expected_types = ["multichoice", "truefalse", "shortanswer", "numerical", "matching", "cloze", "essay"]
    for qtype in expected_types:
        assert qtype in breakdown, f"Missing question type '{qtype}' in breakdown: {breakdown}"


def test_bio_marketplace_publish_and_verify(hub_client, teacher_jwt):
    """Publish Biology package to central Marketplace with SEK II BE taxonomy and verify download."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    package_id = f"ch.gym.be.bio.genetik.{ts}"
    version = "1.0.0"

    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    metadata = {
        "id": package_id,
        "version": version,
        "title": f"Biologie SF Molekulargenetik {ts}",
        "summary": "Gymnasium Bern Schwerpunktfach Biologie Pruefungspaket mit 20 Aufgaben",
        "language": "de-CH",
        "taxonomy": {
            "subject": "Biologie",
            "level": "SF",
            "canton": "BE"
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


def test_bio_moodle_import_and_media_preservation(remote_php):
    """Import Biology package into Moodle 1 (5.0) and verify question bank hydration and PNG image."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>BIO_", f"<name><text>BIO_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    // Query imported primary questions
    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'BIO_{ts}%']
    );

    // Check PNG file in Moodle files table
    $files = $DB->get_records_sql(
        "SELECT id, filename, mimetype, filesize FROM {{files}} WHERE component = 'question' AND filename = 'dna_replication.png' ORDER BY id DESC LIMIT 1"
    );
    $pngfile = reset($files);

    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'db_count' => count($questions),
        'has_png' => !empty($pngfile),
        'png_mime' => $pngfile ? $pngfile->mimetype : null
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Import PHP execution failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] == 20
    assert data["db_count"] == 20
    assert data["has_png"] is True
    assert data["png_mime"] == "image/png"


def test_bio_cloze_and_matching_hydration(remote_php):
    """Verify child subquestion records are hydrated for Cloze and Matching questions in Moodle DB."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>BIO_", f"<name><text>BIO_HYD_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    // 1. Cloze subquestions check (parent = 0 selects the root multianswer question)
    $cloze_parent = $DB->get_record('question', ['name' => 'BIO_HYD_{ts}_Q17_Proteinsynthese_Ablauf_Lueckentext', 'parent' => 0], 'id', MUST_EXIST);
    $cloze_children = $DB->get_records('question', ['parent' => $cloze_parent->id]);

    // 2. Matching subquestions check
    $match_q = $DB->get_record('question', ['name' => 'BIO_HYD_{ts}_Q14_Zellorganellen_Funktion_Zuordnung'], 'id', MUST_EXIST);
    $match_subs = $DB->get_records('qtype_match_subquestions', ['questionid' => $match_q->id]);

    echo json_encode([
        'cloze_children_count' => count($cloze_children),
        'match_subs_count' => count($match_subs)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Hydration check failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["cloze_children_count"] >= 3, f"Expected at least 3 Cloze subquestions, got: {data['cloze_children_count']}"
    assert data["match_subs_count"] == 4, f"Expected 4 Matching subquestions, got: {data['match_subs_count']}"


def test_bio_live_quiz_attempt_100_percent(remote_php, hetzner_ssh):
    """Execute live student attempt on imported Biology questions and verify 100% score via CLI quiz harness."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>BIO_", f"<name><text>BIO_ATT_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    # 1. Import questions into Moodle 1
    import_php = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $q_tf = $DB->get_record('question', ['name' => 'BIO_ATT_{ts}_Q05_RNA_Uracil_Vorkommen'], 'id', MUST_EXIST);
    $q_num = $DB->get_record('question', ['name' => 'BIO_ATT_{ts}_Q12_Basen_Pro_Codon'], 'id', MUST_EXIST);
    $q_sa = $DB->get_record('question', ['name' => 'BIO_ATT_{ts}_Q08_DNA_Entwindungsenzym'], 'id', MUST_EXIST);

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
        "quizname": f"Klausur Molekulargenetik {ts}",
        "questionids": [tf_id, num_id, sa_id]
    })
    c_res = hetzner_ssh(
        f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one create_and_populate_quiz '{quiz_payload}'"
    )
    assert c_res.returncode == 0
    c_data = json.loads(c_res.stdout[c_res.stdout.find("{"):])
    quizid = c_data["quizid"]
    cmid = c_data["cmid"]

    try:
        # 3. Submit student attempt with 100% correct answers
        # Slot 1: TF Q05 -> answer = "1" (true)
        # Slot 2: NUM Q12 -> answer = "3"
        # Slot 3: SA Q08 -> answer = "Helikase"
        att_payload = json.dumps({
            "quizid": quizid,
            "userid": 4,
            "answers": {
                "1": {"answer": "1"},
                "2": {"answer": "3"},
                "3": {"answer": "Helikase"}
            }
        })
        att_res = hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one execute_attempt '{att_payload}'"
        )
        assert att_res.returncode == 0
        att_data = json.loads(att_res.stdout[att_res.stdout.find("{"):])
        assert att_data["status"] == "ok"
        assert att_data["is_finished"] is True
        assert att_data["totalfraction"] == 3.0
        assert att_data["slots"]["1"]["state"] == "gradedright"
        assert att_data["slots"]["2"]["state"] == "gradedright"
        assert att_data["slots"]["3"]["state"] == "gradedright"
    finally:
        clean_payload = json.dumps({"cmid": cmid})
        hetzner_ssh(
            f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one cleanup_quiz '{clean_payload}'"
        )
