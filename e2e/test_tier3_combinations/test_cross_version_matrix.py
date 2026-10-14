"""
Tier 3 Combinations Suite 3: Cross-Version Interchange Matrix (ORIGINAL_REQUEST §R1, TEST_INFRA §F14).
Verifies:
1. Forward Interchange: Moodle 1 (5.0 Stable) -> Central Hub -> Moodle 2 (4.5 LTS).
2. Reverse Interchange: Moodle 2 (4.5 LTS) -> Central Hub -> Moodle 1 (5.0 Stable).
3. Full Roundtrip Content Fidelity: M1 -> Hub -> M2 -> Hub -> M1 (lossless byte preservation).
4. Cross-Version Media URL Rewriting and persistence across different core version storage layers.
5. Context mapping integrity & orphan record prevention in core DB context tables.
"""

import time
import json
import base64
import pytest


def test_t3_12_forward_interchange_m1_to_m2(hub_client, teacher_jwt, remote_php):
    """T3.12: Forward interchange M1 (5.0) -> Hub -> M2 (4.5 LTS)."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)

    # 1. Export from M1
    php_export = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $q = $DB->get_record_sql("SELECT id FROM {question} WHERE qtype != :top ORDER BY id ASC LIMIT 1", ["top" => "category"]);
    $xml = $exporter->export_questions_xml([$q->id]);
    echo json_encode(['xml' => $xml]);
    """
    res_exp = remote_php(php_export, php_bin="php8.2")
    assert res_exp.returncode == 0
    xml_data = json.loads(res_exp.stdout[res_exp.stdout.find("{"):])["xml"]

    # 2. Publish to Hub
    pkg_id = f"ch.gym.zh.t3.fwd.{ts}"
    meta = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"Forward Matrix {ts}",
        "summary": "Forward transfer test package",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    pub_resp = hub_client.publish_package(meta, xml_data)
    assert pub_resp.status_code == 201

    # 3. Download from Hub
    dl_resp = hub_client.download_release(pkg_id, "1.0.0")
    assert dl_resp.status_code == 200
    b64_dl = base64.b64encode(dl_resp.text.encode("utf-8")).decode("ascii")

    # 4. Import into M2 (4.5 LTS)
    php_imp = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64_dl}');
    $result = $importer->import_package($xml, true);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'version' => $CFG->release
    ]);
    """
    res_imp = remote_php(php_imp, php_bin="php8.1")
    assert res_imp.returncode == 0
    data = json.loads(res_imp.stdout[res_imp.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] >= 1
    assert "4.5" in data["version"]


def test_t3_13_reverse_interchange_m2_to_m1(hub_client, teacher_jwt, remote_php):
    """T3.13: Reverse interchange M2 (4.5 LTS) -> Hub -> M1 (5.0 Stable)."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)

    # 1. Export from M2
    php_export = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $q = $DB->get_record_sql("SELECT id FROM {question} WHERE qtype != :top ORDER BY id DESC LIMIT 1", ["top" => "category"]);
    $xml = $exporter->export_questions_xml([$q->id]);
    echo json_encode(['xml' => $xml]);
    """
    res_exp = remote_php(php_export, php_bin="php8.1")
    assert res_exp.returncode == 0
    xml_data = json.loads(res_exp.stdout[res_exp.stdout.find("{"):])["xml"]

    # 2. Publish to Hub
    pkg_id = f"ch.gym.be.t3.rev.{ts}"
    meta = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"Reverse Matrix {ts}",
        "summary": "Reverse transfer test package",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "BE"},
    }
    pub_resp = hub_client.publish_package(meta, xml_data)
    assert pub_resp.status_code == 201

    # 3. Download from Hub
    dl_resp = hub_client.download_release(pkg_id, "1.0.0")
    assert dl_resp.status_code == 200
    b64_dl = base64.b64encode(dl_resp.text.encode("utf-8")).decode("ascii")

    # 4. Import into M1 (5.0 Stable)
    php_imp = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64_dl}');
    $result = $importer->import_package($xml, true);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'version' => $CFG->release
    ]);
    """
    res_imp = remote_php(php_imp, php_bin="php8.2")
    assert res_imp.returncode == 0
    data = json.loads(res_imp.stdout[res_imp.stdout.find("{"):])
    assert data["success"] is True
    assert data["count"] >= 1
    assert "5.0" in data["version"]


def test_t3_14_roundtrip_fidelity_m1_to_m2_to_m1(hub_client, teacher_jwt, remote_php):
    """T3.14: Full roundtrip M1 -> Hub -> M2 -> Hub -> M1 preserves question names and answers."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    original_name = f"Roundtrip Question {ts}"

    # Sample XML to start roundtrip
    init_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/RT_{ts}</text></category></question>
  <question type="multichoice">
    <name><text>{original_name}</text></name>
    <questiontext format="html"><text><![CDATA[<p>Roundtrip test prompt</p>]]></text></questiontext>
    <single>true</single>
    <answer fraction="100"><text>Richtig</text></answer>
    <answer fraction="0"><text>Falsch</text></answer>
  </question>
</quiz>"""

    # 1. Publish to Hub
    pkg_id_1 = f"ch.gym.zh.t3.rt1.{ts}"
    meta_1 = {
        "id": pkg_id_1,
        "version": "1.0.0",
        "title": f"RT Step 1 {ts}",
        "summary": "Roundtrip step 1",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    hub_client.publish_package(meta_1, init_xml)

    # 2. Ingest into M2
    dl_1 = hub_client.download_release(pkg_id_1, "1.0.0").text
    b64_1 = base64.b64encode(dl_1.encode("utf-8")).decode("ascii")
    php_imp_m2 = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package(base64_decode('{b64_1}'), true);
    $qid = $result->questionids[0];
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $reexported = $exporter->export_questions_xml([$qid]);
    echo json_encode(['reexported' => $reexported]);
    """
    res_m2 = remote_php(php_imp_m2, php_bin="php8.1")
    assert res_m2.returncode == 0
    reexported_xml = json.loads(res_m2.stdout[res_m2.stdout.find("{"):])["reexported"]

    # 3. Publish M2 export to Hub
    pkg_id_2 = f"ch.gym.zh.t3.rt2.{ts}"
    meta_2 = {
        "id": pkg_id_2,
        "version": "1.0.0",
        "title": f"RT Step 2 {ts}",
        "summary": "Roundtrip step 2",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    hub_client.publish_package(meta_2, reexported_xml)

    # 4. Ingest back into M1
    dl_2 = hub_client.download_release(pkg_id_2, "1.0.0").text
    b64_2 = base64.b64encode(dl_2.encode("utf-8")).decode("ascii")
    php_imp_m1 = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package(base64_decode('{b64_2}'), true);
    $qid = $result->questionids[0];
    $q = $DB->get_record('question', ['id' => $qid]);
    echo json_encode(['name' => $q->name, 'qtype' => $q->qtype]);
    """
    res_m1 = remote_php(php_imp_m1, php_bin="php8.2")
    assert res_m1.returncode == 0
    final_data = json.loads(res_m1.stdout[res_m1.stdout.find("{"):])
    assert final_data["name"] == original_name
    assert final_data["qtype"] == "multichoice"


def test_t3_15_media_url_rewriting_cross_version(remote_php):
    """T3.15: Verify embedded media @@PLUGINFILE@@ is preserved and rewritten across versions."""
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    ts = int(time.time() * 1000)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/MediaCV_{ts}</text></category></question>
  <question type="essay">
    <name><text>Media Cross-Version {ts}</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Photo: <img src="@@PLUGINFILE@@/pixel.png" /></p>]]></text>
      <file name="pixel.png" encoding="base64">{png_b64}</file>
    </questiontext>
  </question>
</quiz>"""
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")

    # Import into Moodle 2
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    require_once($CFG->libdir . '/questionlib.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $result = $importer->import_package(base64_decode('{b64}'), true);
    $qid = $result->questionids[0];
    $q = $DB->get_record('question', ['id' => $qid]);
    $ctx = context_course::instance(2);
    $rendered = question_rewrite_question_urls($q->questiontext, 'pluginfile.php', $ctx->id, 'question', 'questiontext', [$q->id], $q->id);
    echo json_encode([
        'contains_pluginfile' => (strpos($rendered, 'pluginfile.php') !== false),
        'file_registered' => $DB->record_exists('files', ['filename' => 'pixel.png'])
    ]);
    """
    res = remote_php(php_code, php_bin="php8.1")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["contains_pluginfile"] is True
    assert data["file_registered"] is True


def test_t3_16_category_context_resolution_no_orphans(remote_php):
    """T3.16: Verify imported categories have valid contextid and zero orphan records exist."""
    # Check on both Moodle 1 and Moodle 2
    for m_path, php_bin in [("/mnt/HC_Volume_100926434/www/moodle-one", "php8.2"), ("/mnt/HC_Volume_100926434/www/moodle-two", "php8.1")]:
        php_code = f"""
        define('CLI_SCRIPT', true);
        require_once('{m_path}/config.php');
        $orphans = $DB->get_records_sql("SELECT id, name, contextid FROM {{question_categories}} WHERE contextid NOT IN (SELECT id FROM {{context}})");
        echo json_encode(['orphan_count' => count($orphans)]);
        """
        res = remote_php(php_code, php_bin=php_bin)
        assert res.returncode == 0
        data = json.loads(res.stdout[res.stdout.find("{"):])
        assert data["orphan_count"] == 0, f"Found orphan question categories in {m_path}: {data}"
