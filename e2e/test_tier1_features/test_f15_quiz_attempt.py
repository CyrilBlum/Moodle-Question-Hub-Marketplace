"""
Feature 15: Active Moodle Quiz Attempt & Grading (ORIGINAL_REQUEST §R1, TEST_INFRA §F15).
Verifies on BOTH Moodle 1 (5.0) and Moodle 2 (4.5 LTS):
1. Automated Quiz instance creation and slot linking.
2. Student attempt submission with 100% correct answers (state: gradedright, fraction: 1.0).
3. Student attempt submission with 0% incorrect answers (state: gradedwrong, fraction: 0.0).
4. Acceptance criterion: questions authored in one Moodle, published via the Hub, imported into the
   other Moodle and answered in an active quiz there (M1 -> Hub -> M2 and M2 -> Hub -> M1).
5. Embedded media URL rewriting (@@PLUGINFILE@@ -> pluginfile.php) in quiz question render.

Every test imports its own questions; the session cleanup fixture in conftest.py removes them again.
"""

import base64
import json
import time
import pytest

from conftest import MOODLE_INSTANCES, run_harness

COURSE_ID = 2
STUDENT_ID = 4


def _questions_xml(prefix: str) -> str:
    """Four core question types with known correct answers (quiz slot order = list order)."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/E2E_F15_{prefix}</text></category>
  </question>
  <question type="truefalse">
    <name><text>{prefix}_TF</text></name>
    <questiontext format="html"><text><![CDATA[<p>Bern ist die Bundesstadt der Schweiz.</p>]]></text></questiontext>
    <defaultgrade>1</defaultgrade>
    <answer fraction="100"><text>true</text></answer>
    <answer fraction="0"><text>false</text></answer>
  </question>
  <question type="multichoice">
    <name><text>{prefix}_MC</text></name>
    <questiontext format="html"><text><![CDATA[<p>Welcher Kanton hat die meisten Einwohnerinnen und Einwohner?</p>]]></text></questiontext>
    <defaultgrade>1</defaultgrade>
    <single>true</single>
    <shuffleanswers>0</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <answer fraction="100" format="html"><text>Zürich</text></answer>
    <answer fraction="0" format="html"><text>Uri</text></answer>
    <answer fraction="0" format="html"><text>Glarus</text></answer>
  </question>
  <question type="shortanswer">
    <name><text>{prefix}_SA</text></name>
    <questiontext format="html"><text><![CDATA[<p>Wie heisst die Bundesstadt der Schweiz?</p>]]></text></questiontext>
    <defaultgrade>1</defaultgrade>
    <usecase>0</usecase>
    <answer fraction="100"><text>Bern</text></answer>
  </question>
  <question type="numerical">
    <name><text>{prefix}_NUM</text></name>
    <questiontext format="html"><text><![CDATA[<p>Wie viele Kantone hat die Schweiz?</p>]]></text></questiontext>
    <defaultgrade>1</defaultgrade>
    <answer fraction="100"><text>26</text><tolerance>0</tolerance></answer>
  </question>
</quiz>"""


QTYPE_ORDER = ["TF", "MC", "SA", "NUM"]
CORRECT_ANSWERS = {"1": {"answer": "1"}, "2": {"answer": "0"}, "3": {"answer": "Bern"}, "4": {"answer": "26"}}
WRONG_ANSWERS = {"1": {"answer": "0"}, "2": {"answer": "2"}, "3": {"answer": "Uri"}, "4": {"answer": "23"}}


def _import_questions(remote_php, instance: str, xml: str, prefix: str) -> list:
    """Imports XML through the qbank_questionhub importer and returns question IDs in QTYPE_ORDER."""
    moodle = MOODLE_INSTANCES[instance]
    b64_xml = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    names = json.dumps([f"{prefix}_{t}" for t in QTYPE_ORDER])
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('{moodle['root']}/config.php');
    $importer = new \\qbank_questionhub\\package_importer({COURSE_ID});
    $result = $importer->import_package(base64_decode('{b64_xml}'));
    $ids = [];
    foreach (json_decode('{names}') as $name) {{
        $ids[] = (int)$DB->get_field_sql('SELECT MAX(id) FROM {{question}} WHERE name = ?', [$name]);
    }}
    echo json_encode(['success' => $result->success, 'count' => $result->questioncount, 'ids' => $ids]);
    """
    res = remote_php(php_code, php_bin=moodle["php"])
    assert res.returncode == 0, f"Import on {moodle['label']} failed: {res.stderr}\n{res.stdout}"
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["success"] is True, f"Import on {moodle['label']} failed: {data}"
    assert data["count"] == len(QTYPE_ORDER)
    assert all(qid > 0 for qid in data["ids"]), f"Imported questions not found by name: {data}"
    return data["ids"]


def _export_questions(remote_php, instance: str, qids: list) -> str:
    moodle = MOODLE_INSTANCES[instance]
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('{moodle['root']}/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter({COURSE_ID});
    echo json_encode(['xml' => $exporter->export_questions_xml({json.dumps(qids)})]);
    """
    res = remote_php(php_code, php_bin=moodle["php"])
    assert res.returncode == 0, f"Export on {moodle['label']} failed: {res.stderr}\n{res.stdout}"
    return json.loads(res.stdout[res.stdout.find("{"):])["xml"]


def _run_quiz(instance: str, qids: list, answers: dict, quizname: str) -> dict:
    quiz = run_harness(instance, "create_and_populate_quiz",
                       {"courseid": COURSE_ID, "quizname": quizname, "questionids": qids})
    assert quiz["status"] == "ok", quiz
    assert quiz["slots"] == len(qids)
    try:
        attempt = run_harness(instance, "execute_attempt",
                              {"quizid": quiz["quizid"], "userid": STUDENT_ID, "answers": answers})
        assert attempt["status"] == "ok", attempt
        return attempt
    finally:
        run_harness(instance, "cleanup_quiz", {"cmid": quiz["cmid"]})


@pytest.mark.parametrize("instance", ["m1", "m2"])
def test_f15_t01_quiz_creation(remote_php, instance):
    """Verify quiz instance creation and question slot linking on both Moodle versions."""
    prefix = f"F15_create_{instance}_{int(time.time() * 1000)}"
    qids = _import_questions(remote_php, instance, _questions_xml(prefix), prefix)
    quiz = run_harness(instance, "create_and_populate_quiz",
                       {"courseid": COURSE_ID, "quizname": f"E2E_{prefix}", "questionids": qids})
    assert quiz["status"] == "ok"
    assert quiz["quizid"] > 0
    assert quiz["cmid"] > 0
    assert quiz["slots"] == len(qids)
    cleaned = run_harness(instance, "cleanup_quiz", {"cmid": quiz["cmid"]})
    assert cleaned["status"] == "ok"


@pytest.mark.parametrize("instance", ["m1", "m2"])
def test_f15_t02_correct_student_attempt_100_percent(remote_php, instance):
    """Verify correct responses earn full marks and gradedright on both Moodle versions."""
    prefix = f"F15_right_{instance}_{int(time.time() * 1000)}"
    qids = _import_questions(remote_php, instance, _questions_xml(prefix), prefix)
    attempt = _run_quiz(instance, qids, CORRECT_ANSWERS, f"E2E_{prefix}")
    assert attempt["is_finished"] is True
    assert attempt["totalfraction"] == float(len(qids)), attempt
    for slot in CORRECT_ANSWERS:
        assert attempt["slots"][slot]["state"] == "gradedright", f"Slot {slot}: {attempt['slots'][slot]}"
        assert attempt["slots"][slot]["mark"] == 1.0


@pytest.mark.parametrize("instance", ["m1", "m2"])
def test_f15_t03_incorrect_student_attempt_0_percent(remote_php, instance):
    """Verify wrong responses earn zero marks and gradedwrong on both Moodle versions."""
    prefix = f"F15_wrong_{instance}_{int(time.time() * 1000)}"
    qids = _import_questions(remote_php, instance, _questions_xml(prefix), prefix)
    attempt = _run_quiz(instance, qids, WRONG_ANSWERS, f"E2E_{prefix}")
    assert attempt["is_finished"] is True
    assert attempt["totalfraction"] == 0.0, attempt
    for slot in WRONG_ANSWERS:
        assert attempt["slots"][slot]["state"] == "gradedwrong", f"Slot {slot}: {attempt['slots'][slot]}"
        assert attempt["slots"][slot]["mark"] == 0.0


@pytest.mark.parametrize("source,target", [("m1", "m2"), ("m2", "m1")])
def test_f15_t04_transfer_via_hub_and_quiz_on_target(remote_php, hub_client, teacher_jwt, source, target):
    """Acceptance criterion: author on source Moodle, publish via Hub, import on target, answer in a quiz there."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    prefix = f"F15_xfer_{source}to{target}_{ts}"

    # 1. Author the questions on the source Moodle and export them with the plugin.
    source_ids = _import_questions(remote_php, source, _questions_xml(prefix), prefix)
    exported_xml = _export_questions(remote_php, source, source_ids)
    for qtype in QTYPE_ORDER:
        assert f"{prefix}_{qtype}" in exported_xml, f"{prefix}_{qtype} missing from export"

    # 2. Publish to the Hub and download the immutable release.
    pkg_id = f"ch.gym.zh.f15.{source}to{target}.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"F15 Transfer {source} -> {target} {ts}",
        "summary": "Quiz-verified cross-version transfer",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    pub = hub_client.publish_package(metadata=metadata, xml_content=exported_xml)
    assert pub.status_code == 201, f"Publish failed: {pub.status_code} {pub.text}"
    dl = hub_client.download_release(pkg_id, "1.0.0")
    assert dl.status_code == 200, f"Download failed: {dl.status_code} {dl.text}"

    # 3. Import on the target Moodle and answer all questions correctly in an active quiz.
    target_ids = _import_questions(remote_php, target, dl.text, prefix)
    attempt = _run_quiz(target, target_ids, CORRECT_ANSWERS, f"E2E_{prefix}")
    assert attempt["is_finished"] is True
    assert attempt["totalfraction"] == float(len(target_ids)), attempt
    for slot, qtype in zip(CORRECT_ANSWERS, ["truefalse", "multichoice", "shortanswer", "numerical"]):
        assert attempt["slots"][slot]["qtype"] == qtype
        assert attempt["slots"][slot]["state"] == "gradedright", f"Slot {slot}: {attempt['slots'][slot]}"


def test_f15_t05_embedded_media_url_rewrite(remote_php):
    """Verify embedded media placeholders @@PLUGINFILE@@ are rewritten to /pluginfile.php/ URLs."""
    php_code = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    require_once($CFG->libdir . '/questionlib.php');
    $q = $DB->get_record_sql("SELECT id, questiontext, questiontextformat FROM {question} WHERE questiontext LIKE :m LIMIT 1", ["m" => "%@@PLUGINFILE@@%"]);
    if (!$q) {
        echo json_encode(['found' => false]);
        exit;
    }
    $context = context_course::instance(2);
    $rendered = question_rewrite_question_urls($q->questiontext, 'pluginfile.php', $context->id, 'question', 'questiontext', [$q->id], $q->id);
    echo json_encode([
        'found' => true,
        'has_pluginfile' => (strpos($rendered, 'pluginfile.php') !== false),
        'has_raw_token' => (strpos($rendered, '@@PLUGINFILE@@') !== false)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    output = res.stdout.strip()
    data = json.loads(output[output.find("{"):])
    assert data["found"] is True, "No question with embedded media found"
    assert data["has_pluginfile"] is True, "Rendered question text missing pluginfile.php URL"
    assert data["has_raw_token"] is False, "Raw @@PLUGINFILE@@ token was not rewritten in output"
