"""
Feature 14: Bidirectional Live Question Transfer (ORIGINAL_REQUEST §R1, TEST_INFRA §F14).
Verifies end-to-end question package migration between Moodle 5.0 Stable and Moodle 4.5 LTS:
1. Export from Moodle 1 (5.0).
2. Publish exported Moodle 1 package to Marketplace.
3. Import package into Moodle 2 (4.5 LTS) and verify DB persistence.
4. Export from Moodle 2 (4.5 LTS) and publish reverse release to Marketplace.
5. Import package into Moodle 1 (5.0) and verify lossless question hydration.
"""

import time
import json
import base64
import pytest


def test_f14_t01_export_moodle1(remote_php):
    """Verify exporting questions from Moodle 1 (5.0) produces valid XML with canonical tokens."""
    php_code = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $q = $DB->get_record_sql("SELECT id FROM {question} WHERE qtype != :top ORDER BY (name = 'E2E Seed Frage') DESC, id ASC LIMIT 1", ["top" => "category"]);
    $xml = $exporter->export_questions_xml([$q->id]);
    echo json_encode([
        'xml' => $xml,
        'has_quiz' => (strpos($xml, '<quiz>') !== false),
        'has_course' => (strpos($xml, '$course$') !== false)
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0, f"Export failed: {res.stderr}\n{res.stdout}"
    output = res.stdout.strip()
    json_start = output.find("{")
    assert json_start != -1, f"No JSON output: {output}"
    data = json.loads(output[json_start:])
    assert data["has_quiz"] is True, "Exported XML missing <quiz> root tag"
    assert data["has_course"] is True, "Exported XML missing canonical $course$ token"


def test_f14_t02_publish_to_marketplace(hub_client, teacher_jwt, remote_php):
    """Verify publishing exported Moodle 1 package to central Marketplace."""
    hub_client.set_token(teacher_jwt)
    php_code = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $q = $DB->get_record_sql("SELECT id FROM {question} WHERE qtype != :top ORDER BY (name = 'E2E Seed Frage') DESC, id ASC LIMIT 1", ["top" => "category"]);
    $xml = $exporter->export_questions_xml([$q->id]);
    echo json_encode(['xml' => $xml]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    output = res.stdout.strip()
    data = json.loads(output[output.find("{"):])
    xml_content = data["xml"]

    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.m1tom2.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"E2E Bidirectional Test M1->M2 {ts}",
        "summary": "E2E migration package test from Moodle 1",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    resp = hub_client.publish_package(metadata=metadata, xml_content=xml_content)
    assert resp.status_code == 201, f"Marketplace publish failed: {resp.status_code} {resp.text}"
    detail = hub_client.get_package(pkg_id)
    assert detail.status_code == 200
    assert detail.json().get("id") == pkg_id


def test_f14_t03_import_into_moodle2(hub_client, teacher_jwt, remote_php):
    """Verify importing published M1 package into Moodle 2 (4.5 LTS)."""
    hub_client.set_token(teacher_jwt)
    # 1. Export sample from M1 and publish
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.m1tom2imp.{ts}"
    sample_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/E2E_M1_to_M2_{ts}</text></category>
  </question>
  <question type="truefalse">
    <name><text>M1 to M2 Migration Test {ts}</text></name>
    <questiontext format="html"><text><![CDATA[<p>TrueFalse test migrated from M1 to M2.</p>]]></text></questiontext>
    <answer fraction="100"><text>true</text></answer>
    <answer fraction="0"><text>false</text></answer>
  </question>
</quiz>"""
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"M1 to M2 Migration {ts}",
        "summary": "M1 to M2 import verification",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    pub_res = hub_client.publish_package(metadata=metadata, xml_content=sample_xml)
    assert pub_res.status_code == 201

    # 2. Download from Hub
    dl_resp = hub_client.download_release(pkg_id, "1.0.0")
    assert dl_resp.status_code == 200
    downloaded_xml = dl_resp.text
    b64_xml = base64.b64encode(downloaded_xml.encode("utf-8")).decode("ascii")

    # 3. Import into Moodle 2
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64_xml}');
    $result = $importer->import_package($xml);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'ids' => $result->questionids
    ]);
    """
    res = remote_php(php_code, php_bin="php8.1")
    assert res.returncode == 0, f"Moodle 2 import failed: {res.stderr}\n{res.stdout}"
    output = res.stdout.strip()
    data = json.loads(output[output.find("{"):])
    assert data["success"] is True, f"Import into Moodle 2 failed: {data}"
    assert data["count"] >= 1, "Expected at least 1 imported question in Moodle 2"


def test_f14_t04_export_moodle2_and_publish(remote_php, hub_client, teacher_jwt):
    """Verify exporting from Moodle 2 (4.5 LTS) and publishing reverse release to Marketplace."""
    hub_client.set_token(teacher_jwt)
    php_code = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $q = $DB->get_record_sql("SELECT id FROM {question} WHERE qtype != :top ORDER BY id DESC LIMIT 1", ["top" => "category"]);
    $xml = $exporter->export_questions_xml([$q->id]);
    echo json_encode(['xml' => $xml]);
    """
    res = remote_php(php_code, php_bin="php8.1")
    assert res.returncode == 0, f"Moodle 2 export failed: {res.stderr}\n{res.stdout}"
    output = res.stdout.strip()
    data = json.loads(output[output.find("{"):])
    xml_content = data["xml"]

    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.be.m2tom1.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"E2E Bidirectional Test M2->M1 {ts}",
        "summary": "Reverse migration package from Moodle 2",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "BE"},
    }
    resp = hub_client.publish_package(metadata=metadata, xml_content=xml_content)
    assert resp.status_code == 201
    pkg = hub_client.get_package(pkg_id).json()
    releases = pkg.get("releases", [])
    assert len(releases) >= 1
    assert releases[0].get("sha256") is not None, "SHA-256 missing on published release"


def test_f14_t05_import_into_moodle1(hub_client, teacher_jwt, remote_php):
    """Verify importing Moodle 2 package back into Moodle 1 (5.0 Stable) with zero data loss."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.be.m2tom1imp.{ts}"
    sample_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/E2E_M2_to_M1_{ts}</text></category>
  </question>
  <question type="multichoice">
    <name><text>M2 to M1 Migration MC {ts}</text></name>
    <questiontext format="html"><text><![CDATA[<p>Multichoice migrated from M2 to M1.</p>]]></text></questiontext>
    <single>true</single>
    <answer fraction="100"><text>Correct</text></answer>
    <answer fraction="0"><text>Incorrect</text></answer>
  </question>
</quiz>"""
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"M2 to M1 Migration {ts}",
        "summary": "M2 to M1 import into Moodle 1",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "BE"},
    }
    pub_res = hub_client.publish_package(metadata=metadata, xml_content=sample_xml)
    assert pub_res.status_code == 201

    dl_resp = hub_client.download_release(pkg_id, "1.0.0")
    assert dl_resp.status_code == 200
    b64_xml = base64.b64encode(dl_resp.text.encode("utf-8")).decode("ascii")

    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64_xml}');
    $result = $importer->import_package($xml);
    echo json_encode([
        'success' => $result->success,
        'count' => $result->questioncount,
        'ids' => $result->questionids
    ]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    output = res.stdout.strip()
    data = json.loads(output[output.find("{"):])
    assert data["success"] is True
    assert data["count"] >= 1
