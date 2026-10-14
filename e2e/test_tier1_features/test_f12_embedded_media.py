"""
Feature 12: Embedded Media Base64 Preservation (ORIGINAL_REQUEST §R1, TEST_INFRA §F12).
Verifies:
1. Base64 media extraction and storage into Moodle file system (mdl_files).
2. @@PLUGINFILE@@ placeholder translation and preservation.
3. Directory traversal defense (ERR_FILE_PATH_TRAVERSAL).
4. Prohibited executable media extensions (ERR_DISALLOWED_MEDIA_MIME).
5. Malicious SVG script/event handler detection (ERR_SVG_MALICIOUS_SCRIPT).
"""

import os
import base64
import json
import pytest


def test_f12_t01_base64_media_extraction(remote_php, fixtures_dir):
    """Verify that Base64-encoded media files in XML packages are extracted to mdl_files."""
    pkg_path = os.path.join(fixtures_dir, "packages", "package_with_embedded_media.xml")
    with open(pkg_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    b64_xml = base64.b64encode(xml_content.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64_xml}');
    $result = $importer->import_package($xml);
    $files = $DB->get_records_sql("SELECT id, filename, filesize, mimetype FROM {{files}} WHERE component = 'question' AND filearea = 'questiontext' AND filename NOT LIKE '.%' ORDER BY id DESC LIMIT 5");
    echo json_encode([
        'success' => $result->success,
        'imported_count' => $result->questioncount,
        'files' => array_values($files)
    ]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0, f"Import script failed: {res.stderr}\n{res.stdout}"
    output = res.stdout.strip()
    json_start = output.find("{")
    assert json_start != -1, f"No JSON output: {output}"
    data = json.loads(output[json_start:])
    assert data["success"] is True, "Import was not successful"
    assert data["imported_count"] >= 1, "Failed to import media question"
    assert len(data["files"]) >= 1, "No media files registered in mdl_files"
    f0 = data["files"][0]
    assert int(f0["filesize"]) > 0, "Extracted media file size is 0"
    assert "image" in f0["mimetype"] or f0["filename"].endswith(".png"), f"Unexpected mimetype: {f0}"


def test_f12_t02_pluginfile_url_translation(remote_php, fixtures_dir):
    """Verify @@PLUGINFILE@@ placeholder is preserved in questiontext."""
    pkg_path = os.path.join(fixtures_dir, "packages", "package_with_embedded_media.xml")
    with open(pkg_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    b64_xml = base64.b64encode(xml_content.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $importer = new \\qbank_questionhub\\package_importer(2);
    $xml = base64_decode('{b64_xml}');
    $result = $importer->import_package($xml);
    $qid = $result->questionids[0];
    $q = $DB->get_record('question', ['id' => $qid]);
    echo json_encode([
        'questiontext' => $q->questiontext,
        'contains_pluginfile' => (strpos($q->questiontext, '@@PLUGINFILE@@') !== false)
    ]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0
    output = res.stdout.strip()
    json_start = output.find("{")
    data = json.loads(output[json_start:])
    assert data["contains_pluginfile"] is True, f"Question text did not contain @@PLUGINFILE@@: {data['questiontext']}"


def test_f12_t03_directory_traversal_defense(remote_php, fixtures_dir):
    """Verify file names with ../ traversal patterns are rejected with ERR_FILE_PATH_TRAVERSAL."""
    atk_path = os.path.join(fixtures_dir, "attacks", "media_traversal_relative.xml")
    with open(atk_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    b64_xml = base64.b64encode(xml_content.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $xml = base64_decode('{b64_xml}');
    $report = \\qbank_questionhub\\preflight_validator::validate($xml);
    $errors = array_column($report->get_errors(), 'code');
    echo json_encode([
        'valid' => $report->is_valid(),
        'errors' => $errors
    ]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0
    output = res.stdout.strip()
    json_start = output.find("{")
    data = json.loads(output[json_start:])
    assert data["valid"] is False, "Traversal attack XML incorrectly evaluated as valid"
    assert "ERR_FILE_PATH_TRAVERSAL" in data["errors"], f"Missing ERR_FILE_PATH_TRAVERSAL: {data['errors']}"


def test_f12_t04_prohibited_executable_media_extensions(hub_client, teacher_jwt, fixtures_dir):
    """Verify media files with executable extensions (.php) are rejected with ERR_DISALLOWED_MEDIA_MIME."""
    hub_client.set_token(teacher_jwt)
    atk_path = os.path.join(fixtures_dir, "attacks", "media_disallowed_php.xml")
    with open(atk_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False, "Prohibited PHP media extension accepted as valid"
    errors = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_DISALLOWED_MEDIA_MIME" in errors, f"Expected ERR_DISALLOWED_MEDIA_MIME in errors: {errors}"


def test_f12_t05_malicious_svg_script_detection(hub_client, teacher_jwt, fixtures_dir):
    """Verify SVG files containing inline scripts or event handlers trigger ERR_SVG_MALICIOUS_SCRIPT."""
    hub_client.set_token(teacher_jwt)
    script_path = os.path.join(fixtures_dir, "attacks", "media_svg_script.xml")
    with open(script_path, "r", encoding="utf-8") as f:
        script_xml = f.read()

    resp = hub_client.preflight(script_xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False, "Malicious SVG script was accepted as valid"
    errors = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SVG_MALICIOUS_SCRIPT" in errors, f"Expected ERR_SVG_MALICIOUS_SCRIPT in errors: {errors}"
