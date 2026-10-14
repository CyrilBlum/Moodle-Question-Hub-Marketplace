"""
Tier 2 Attack Payload Suite: XML Security & Zero-Trust Defense (ORIGINAL_REQUEST §R1, TEST_INFRA §F06).
Evaluates zero-trust defenses against:
1. XXE local file disclosure (/etc/passwd, /etc/hosts)
2. SSRF injection (AWS metadata, MariaDB 3306, Marketplace 8090)
3. Billion Laughs entity expansion bombs
4. Quadratic blowup entity expansion
5. Parameter entity OOB probing
6. Public DTD retrieval
7. XInclude local file extraction
8. XML stylesheet processing instruction injection
9. Whitespace & case variant DOCTYPE evasion
10. Post-CDATA DOCTYPE evasion
11. Multi-byte BOM evasion (UTF-16LE, UTF-16BE)
12. Standalone entity declarations without DOCTYPE
13. Embedded SVG scripts, event handlers, and xlink:href
14. Media path traversal and disallowed extensions
"""

import os
import time
import pytest


def test_xxe_01_file_disclosure_passwd(hub_client, teacher_jwt, fixtures_dir):
    """Verify classic /etc/passwd disclosure attempt is rejected with ERR_XXE_DOCTYPE_FORBIDDEN."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_file_disclosure_passwd.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes
    assert "root:x:" not in resp.text


def test_xxe_02_file_disclosure_hosts(hub_client, teacher_jwt, fixtures_dir):
    """Verify /etc/hosts disclosure attempt is rejected with ERR_XXE_DOCTYPE_FORBIDDEN."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_file_disclosure_hosts.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes
    assert "localhost" not in str(data.get("stats", {}))


def test_xxe_03_ssrf_aws_metadata(hub_client, teacher_jwt, fixtures_dir):
    """Verify AWS metadata service SSRF attempt is blocked."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_ssrf_aws_metadata.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes
    assert "169.254.169.254" not in str(data.get("stats", {}))


def test_xxe_04_ssrf_mariadb_3306(hub_client, teacher_jwt, fixtures_dir):
    """Verify internal MariaDB port SSRF attempt is blocked."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_ssrf_mariadb_3306.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_05_ssrf_marketplace_8090(hub_client, teacher_jwt, fixtures_dir):
    """Verify internal Fastify port SSRF attempt is blocked."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_ssrf_marketplace_8090.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_06_billion_laughs_expansion(hub_client, teacher_jwt, fixtures_dir):
    """Verify Billion Laughs entity expansion bomb is blocked without CPU exhaustion."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_billion_laughs.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    t0 = time.time()
    resp = hub_client.preflight(xml)
    elapsed = time.time() - t0
    assert resp.status_code == 200
    assert elapsed < 3.0, f"Billion laughs processing took too long: {elapsed}s"
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_07_quadratic_blowup(hub_client, teacher_jwt, fixtures_dir):
    """Verify quadratic blowup entity expansion is blocked rapidly."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_quadratic_blowup.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    t0 = time.time()
    resp = hub_client.preflight(xml)
    elapsed = time.time() - t0
    assert resp.status_code == 200
    assert elapsed < 3.0
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_08_parameter_entity(hub_client, teacher_jwt, fixtures_dir):
    """Verify parameter entity OOB probe is rejected."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_parameter_entity.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes or "ERR_XXE_ENTITY_FORBIDDEN" in codes


def test_xxe_09_public_dtd(hub_client, teacher_jwt, fixtures_dir):
    """Verify external public DTD retrieval is blocked."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_public_dtd.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_10_xinclude_injection(hub_client, teacher_jwt, fixtures_dir):
    """Verify XInclude local file extraction is rejected with ERR_XXE_XINCLUDE_FORBIDDEN."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_xinclude_injection.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_XINCLUDE_FORBIDDEN" in codes


def test_xxe_11_stylesheet_injection(hub_client, teacher_jwt, fixtures_dir):
    """Verify XML stylesheet processing instruction is rejected with ERR_XXE_STYLESHEET_FORBIDDEN."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_stylesheet_injection.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_STYLESHEET_FORBIDDEN" in codes


def test_xxe_12_whitespace_doctype(hub_client, teacher_jwt, fixtures_dir):
    """Verify whitespace and case variant DOCTYPE evasion is detected."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_whitespace_doctype.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_13_post_cdata_doctype(hub_client, teacher_jwt, fixtures_dir):
    """Verify DOCTYPE injected after CDATA block is detected."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_post_cdata_doctype.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes


def test_xxe_14_utf16le_bom(hub_client, teacher_jwt, fixtures_dir):
    """Verify UTF-16LE BOM encoded payload is blocked without entity expansion."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_utf16le_bom.bin")
    with open(path, "rb") as f:
        raw_bytes = f.read()
    # Send binary buffer as file
    files = {"file": ("package.xml", raw_bytes, "application/xml")}
    resp = hub_client.session.post(
        f"{hub_client.api_base}/packages/preflight",
        files=files,
        headers=hub_client._headers(),
        timeout=15,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    assert "root:x:" not in resp.text


def test_xxe_15_utf16be_bom(hub_client, teacher_jwt, fixtures_dir):
    """Verify UTF-16BE BOM encoded payload is blocked without entity expansion."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_utf16be_bom.bin")
    with open(path, "rb") as f:
        raw_bytes = f.read()
    files = {"file": ("package.xml", raw_bytes, "application/xml")}
    resp = hub_client.session.post(
        f"{hub_client.api_base}/packages/preflight",
        files=files,
        headers=hub_client._headers(),
        timeout=15,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    assert "root:x:" not in resp.text


@pytest.mark.parametrize("encoding", ["utf-16le", "utf-16be"])
def test_xxe_15b_utf16_without_bom_reports_doctype(hub_client, teacher_jwt, encoding):
    """Verify UTF-16 payloads without BOM are decoded and rejected with the specific XXE diagnostic."""
    hub_client.set_token(teacher_jwt)
    raw_bytes = (
        '<?xml version="1.0" encoding="UTF-16"?>'
        '<!DOCTYPE quiz [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><quiz>&xxe;</quiz>'
    ).encode(encoding)
    files = {"file": ("package.xml", raw_bytes, "application/xml")}
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
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in codes, f"Expected specific XXE diagnostic, got: {codes}"
    assert "root:x:" not in resp.text


def test_xxe_16_standalone_entity(hub_client, teacher_jwt, fixtures_dir):
    """Verify standalone ENTITY declaration without DOCTYPE is rejected with ERR_XXE_ENTITY_FORBIDDEN."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "xxe_standalone_entity.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_XXE_ENTITY_FORBIDDEN" in codes


def test_xxe_17_svg_script_injection(hub_client, teacher_jwt, fixtures_dir):
    """Verify SVG media containing embedded <script> is blocked with ERR_SVG_MALICIOUS_SCRIPT."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "media_svg_script.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SVG_MALICIOUS_SCRIPT" in codes


def test_xxe_18_svg_onload_injection(hub_client, teacher_jwt, fixtures_dir):
    """Verify SVG media containing onload event handler is blocked with ERR_SVG_MALICIOUS_SCRIPT."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "media_svg_onload.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_SVG_MALICIOUS_SCRIPT" in codes


def test_xxe_19_prohibited_php_media(hub_client, teacher_jwt, fixtures_dir):
    """Verify executable media extension (.php) is rejected with ERR_DISALLOWED_MEDIA_MIME."""
    hub_client.set_token(teacher_jwt)
    path = os.path.join(fixtures_dir, "attacks", "media_disallowed_php.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    resp = hub_client.preflight(xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    codes = [e.get("code") for e in data.get("diagnostics", {}).get("errors", [])]
    assert "ERR_DISALLOWED_MEDIA_MIME" in codes


def test_xxe_20_media_traversal_plugin_defense(remote_php, fixtures_dir):
    """Verify Moodle plugin preflight validator blocks path traversal with ERR_FILE_PATH_TRAVERSAL."""
    path = os.path.join(fixtures_dir, "attacks", "media_traversal_relative.xml")
    with open(path, "r", encoding="utf-8") as f:
        xml = f.read()
    import base64
    b64_xml = base64.b64encode(xml.encode("utf-8")).decode("ascii")
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
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    import json
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["valid"] is False
    assert "ERR_FILE_PATH_TRAVERSAL" in data["errors"]
