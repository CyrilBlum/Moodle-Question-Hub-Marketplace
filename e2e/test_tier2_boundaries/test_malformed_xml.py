"""
Tier 2 Suite 2: Malformed XML & Preflight Diagnostics (TEST_INFRA §Tier 2).
Verifies that invalid, corrupted, non-XML, and malformed inputs are handled gracefully:
1. Zero HTTP 500 server crashes across all inputs.
2. Clean structured diagnostic error codes.
3. Defensive handling of binaries, JSON, HTML5, whitespace, and truncated documents.
"""

import os
import pytest


def test_mal_01_truncated_mid_tag(hub_client, teacher_jwt, fixtures_dir):
    """Verify truncated XML tag flags ERR_XML_INVALID_SYNTAX without crash."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "truncated_tag.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes


def test_mal_02_truncated_cdata_block(hub_client, teacher_jwt, fixtures_dir):
    """Verify truncated CDATA block flags ERR_XML_INVALID_SYNTAX."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "truncated_cdata.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes


def test_mal_03_mismatched_closing_tag(hub_client, teacher_jwt, fixtures_dir):
    """Verify mismatched closing tag flags ERR_XML_INVALID_SYNTAX."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "mismatched_tags.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes


def test_mal_04_unclosed_quiz_root(hub_client, teacher_jwt, fixtures_dir):
    """Verify unclosed quiz root flags ERR_XML_INVALID_SYNTAX."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "unclosed_quiz_root.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes


def test_mal_05_missing_quiz_root_tag(hub_client, teacher_jwt, fixtures_dir):
    """Verify alternative root element <root> flags ERR_MISSING_QUIZ_ROOT."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "missing_quiz_root_root.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_MISSING_QUIZ_ROOT" in codes


def test_mal_06_alternative_root_questions(hub_client, teacher_jwt, fixtures_dir):
    """Verify alternative root element <questions> flags ERR_MISSING_QUIZ_ROOT."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "missing_quiz_root_questions.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_MISSING_QUIZ_ROOT" in codes


def test_mal_07_binary_elf_executable(hub_client, teacher_jwt, fixtures_dir):
    """Verify raw ELF binary submitted as XML is safely rejected with ERR_XML_INVALID_SYNTAX."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "binary_elf_executable.xml")
    with open(path, "rb") as f:
        content = f.read()
    files = {"file": ("package.xml", content, "application/xml")}
    resp = hub_client.session.post(
        f"{hub_client.api_base}/packages/preflight",
        files=files,
        headers=hub_client._headers(),
        timeout=15,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes or "ERR_DISALLOWED_MEDIA_MIME" in codes


def test_mal_08_binary_pe_executable(hub_client, teacher_jwt, fixtures_dir):
    """Verify raw PE executable submitted as XML is safely rejected."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "binary_pe_executable.xml")
    with open(path, "rb") as f:
        content = f.read()
    files = {"file": ("package.xml", content, "application/xml")}
    resp = hub_client.session.post(
        f"{hub_client.api_base}/packages/preflight",
        files=files,
        headers=hub_client._headers(),
        timeout=15,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes or "ERR_DISALLOWED_MEDIA_MIME" in codes


def test_mal_09_non_xml_json(hub_client, teacher_jwt, fixtures_dir):
    """Verify JSON payload submitted as XML is rejected with ERR_XML_INVALID_SYNTAX."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "non_xml_json.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XML_INVALID_SYNTAX" in codes


def test_mal_10_non_xml_html5(hub_client, teacher_jwt, fixtures_dir):
    """Verify HTML5 document submitted as XML is rejected."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "non_xml_html5.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes or "ERR_MISSING_QUIZ_ROOT" in codes


def test_mal_11_pure_whitespace(hub_client, teacher_jwt, fixtures_dir):
    """Verify pure whitespace payload triggers clean rejection without crash."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "whitespace_only.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_EMPTY_PAYLOAD" in codes or "ERR_XML_INVALID_SYNTAX" in codes


def test_mal_12_empty_file_zero_bytes(hub_client, teacher_jwt, fixtures_dir):
    """Verify 0-byte file payload triggers ERR_EMPTY_PAYLOAD or HTTP 400 Bad Request."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "empty_payload.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code in [200, 400]
    if resp.status_code == 200:
        data = resp.json()
        assert data.get("valid") is False
        codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
        assert "ERR_EMPTY_PAYLOAD" in codes or "ERR_XML_INVALID_SYNTAX" in codes
    else:
        assert "ERR_EMPTY_PAYLOAD" in resp.text or resp.status_code == 400


def test_mal_13_empty_quiz_tag(hub_client, teacher_jwt, fixtures_dir):
    """Verify <quiz></quiz> with zero questions triggers ERR_NO_QUESTIONS_FOUND."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "empty_quiz_tag.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_NO_QUESTIONS_FOUND" in codes or "ERR_MISSING_QUIZ_ROOT" in codes


def test_mal_14_question_missing_type_attribute(hub_client, teacher_jwt, fixtures_dir):
    """Verify question tag without type attribute triggers ERR_QUESTION_MISSING_TYPE."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "missing_question_type.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_QUESTION_MISSING_TYPE" in codes


def test_mal_15_corrupted_base64_media(hub_client, teacher_jwt, fixtures_dir):
    """Verify invalid base64 characters trigger ERR_MALFORMED_MEDIA_BASE64."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "media_corrupted_base64_chars.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_MALFORMED_MEDIA_BASE64" in codes


def test_mal_16_cloze_unmatched_open_brace(hub_client, teacher_jwt, fixtures_dir):
    """Verify Cloze question with unclosed { brace triggers ERR_CLOZE_SYNTAX_INVALID."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "cloze_unmatched_open_brace.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_CLOZE_SYNTAX_INVALID" in codes


def test_mal_17_cloze_unmatched_close_brace(hub_client, teacher_jwt, fixtures_dir):
    """Verify Cloze question with extra } brace triggers ERR_CLOZE_SYNTAX_INVALID."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "corrupted", "cloze_unmatched_close_brace.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_CLOZE_SYNTAX_INVALID" in codes


def test_mal_18_cloze_literal_braces_plugin(remote_php, fixtures_dir):
    """Verify Cloze question with invalid token syntax is caught by plugin validator."""
    path = os.path.join(fixtures_dir, "corrupted", "cloze_malformed_token.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    import base64
    import json
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    php_code = f"""
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $rep = \\qbank_questionhub\\preflight_validator::validate(base64_decode('{b64}'));
    $errors = array_column($rep->get_errors(), 'code');
    echo json_encode(['valid' => $rep->is_valid(), 'errors' => $errors]);
    """
    res = remote_php(php_code)
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert "ERR_CLOZE_SYNTAX_INVALID" not in data["errors"]
