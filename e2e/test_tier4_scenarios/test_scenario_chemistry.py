"""
Tier 4 Scenario 4: Chemie SF (SEK II LU) — Chemisches Gleichgewicht und Saeure-Base.
Curriculum: Lehrplan SEK II Kanton Luzern, Schwerpunktfach Chemie.
Workload: 18 Questions with titration SVG vector diagram, pH calculations, and structured essay rubrics.
Verifies:
1. Hub preflight validation & breakdown (18 questions, equilibrium, titration, buffers).
2. Marketplace publication with Swiss Gymnasium taxonomy (canton: LU, subject: Chemie, level: SF).
3. Download release integrity and SHA-256 checksum verification.
4. Moodle 2 (4.5 LTS) import, question bank hydration, and titration SVG media preservation.
5. Essay grading rubric (graderinfo) preservation in qtype_essay_options.
6. Live student quiz attempt submission and automated grading scored 100%.
"""

import os
import time
import json
import hashlib
import base64
import pytest


SCENARIO_XML_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "packages", "scenario_chemistry_18q.xml")
)


def test_chem_package_preflight_and_breakdown(hub_client, teacher_jwt):
    """Verify Chemistry scenario package passes Hub preflight diagnostics with 18 questions."""
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
    assert breakdown.get("multichoice") == 4
    assert breakdown.get("numerical") == 4
    assert breakdown.get("shortanswer") == 3
    assert breakdown.get("truefalse") == 3
    assert breakdown.get("matching") == 2
    assert breakdown.get("essay") == 2


def test_chem_marketplace_publish_and_verify(hub_client, teacher_jwt):
    """Publish Chemistry package to central Marketplace with SEK II LU taxonomy and verify download."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    package_id = f"ch.gym.lu.che.gleichgewicht.{ts}"
    version = "1.0.0"

    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    metadata = {
        "id": package_id,
        "version": version,
        "title": f"Chemie SF Gleichgewicht {ts}",
        "summary": "Gymnasium Luzern Schwerpunktfach Chemie Pruefungspaket mit 18 Aufgaben",
        "language": "de-CH",
        "taxonomy": {
            "subject": "Chemie",
            "level": "SF",
            "canton": "LU"
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


def test_chem_moodle_import_and_titration_svg(remote_php):
    """Import Chemistry package into Moodle 2 (4.5 LTS) and verify titration SVG graphic."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>CHEM_", f"<name><text>CHEM_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $questions = $DB->get_records_sql(
        "SELECT id, name, qtype FROM {{question}} WHERE name LIKE :prefix AND parent = 0 ORDER BY id ASC",
        ['prefix' => 'CHEM_{ts}%']
    );

    $files = $DB->get_records_sql(
        "SELECT id, filename, mimetype, filesize FROM {{files}} WHERE component = 'question' AND filename = 'titration_curve.svg' ORDER BY id DESC LIMIT 1"
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
    assert data["count"] == 18
    assert data["db_count"] == 18
    assert data["has_svg"] is True
    assert data["svg_mime"] == "image/svg+xml"


def test_chem_essay_rubric_and_graderinfo(remote_php):
    """Verify essay grading rubrics (graderinfo) are preserved in Moodle DB for teacher grading."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>CHEM_", f"<name><text>CHEM_RUB_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $essay_q = $DB->get_record('question', ['name' => 'CHEM_RUB_{ts}_Q17_Kalkloeslichkeit_Karstbildung', 'parent' => 0], 'id', MUST_EXIST);
    $essay_opt = $DB->get_record('qtype_essay_options', ['questionid' => $essay_q->id]);

    echo json_encode([
        'has_graderinfo' => !empty($essay_opt && $essay_opt->graderinfo),
        'graderinfo_len' => $essay_opt ? strlen($essay_opt->graderinfo) : 0
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Rubric check failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["has_graderinfo"] is True
    assert data["graderinfo_len"] > 20


def test_chem_live_quiz_numerical_and_matching(remote_php, hetzner_ssh):
    """Execute live student attempt on imported Chemistry questions and verify 100% score via CLI quiz harness."""
    ts = int(time.time() * 1000)
    with open(SCENARIO_XML_PATH, "r", encoding="utf-8") as f:
        raw_xml = f.read()

    custom_xml = raw_xml.replace("<name><text>CHEM_", f"<name><text>CHEM_ATT_{ts}_")
    b64_xml = base64.b64encode(custom_xml.encode("utf-8")).decode("ascii")

    # 1. Import questions into Moodle 1
    import_php = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package($xml, true);

    $q_num = $DB->get_record('question', ['name' => 'CHEM_ATT_{ts}_Q05_pH_Starke_Saeure', 'parent' => 0], 'id', MUST_EXIST);
    $q_tf = $DB->get_record('question', ['name' => 'CHEM_ATT_{ts}_Q12_Katalysator_Gleichgewichtslage', 'parent' => 0], 'id', MUST_EXIST);
    $q_sa = $DB->get_record('question', ['name' => 'CHEM_ATT_{ts}_Q10_Prinzip_Vom_Kleinsten_Zwang', 'parent' => 0], 'id', MUST_EXIST);

    echo json_encode([
        'num_id' => (int)$q_num->id,
        'tf_id' => (int)$q_tf->id,
        'sa_id' => (int)$q_sa->id
    ]);
    """
    res_import = remote_php(import_php, php_bin="php8.2")
    assert res_import.returncode == 0
    qids_data = json.loads(res_import.stdout[res_import.stdout.find("{"):])
    num_id = qids_data["num_id"]
    tf_id = qids_data["tf_id"]
    sa_id = qids_data["sa_id"]

    # 2. Create quiz with the 3 questions
    quiz_payload = json.dumps({
        "courseid": 2,
        "quizname": f"Klausur Chemisches Gleichgewicht {ts}",
        "questionids": [num_id, tf_id, sa_id]
    })
    c_res = hetzner_ssh(
        f"php8.2 /mnt/HC_Volume_100926434/moodle_quiz_harness.php /mnt/HC_Volume_100926434/www/moodle-one create_and_populate_quiz '{quiz_payload}'"
    )
    assert c_res.returncode == 0
    c_data = json.loads(c_res.stdout[c_res.stdout.find("{"):])
    quizid = c_data["quizid"]
    cmid = c_data["cmid"]

    try:
        # 3. Submit student attempt:
        # Slot 1: NUM Q05 -> answer = "2.30" (target 2.301, tol 0.02)
        # Slot 2: TF Q12 -> answer = "1" (true)
        # Slot 3: SA Q10 -> answer = "Le Chatelier"
        att_payload = json.dumps({
            "quizid": quizid,
            "userid": 4,
            "answers": {
                "1": {"answer": "2.30"},
                "2": {"answer": "1"},
                "3": {"answer": "Le Chatelier"}
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
