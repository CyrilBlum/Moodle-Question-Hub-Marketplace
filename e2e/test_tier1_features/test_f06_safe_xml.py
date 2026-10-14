"""
Feature 06: Safe XML Parsing & XXE Defense (ORIGINAL_REQUEST §R2).
Verifies strict rejection of DOCTYPE entities, Billion Laughs bombs,
multi-byte encoding bypasses, XInclude injections, and syntax corruption.
"""

import os
import pytest
import requests


def test_f06_t01_xxe_system_entity_rejection(hub_client, teacher_jwt, fixtures_dir):
    """Verify rejection of XML containing DOCTYPE with system entity."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "attacks", "xxe_file_disclosure_passwd.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False, "XXE payload must not be marked valid"
    assert data.get("can_publish") is False
    errors = data.get("diagnostics", {}).get("errors", data.get("errors", []))
    error_codes = [e.get("code") for e in errors]
    assert "ERR_XXE_DOCTYPE_FORBIDDEN" in error_codes


def test_f06_t02_billion_laughs_expansion_defense(hub_client, teacher_jwt, fixtures_dir):
    """Verify recursive entity expansion (Billion Laughs) is blocked safely."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "attacks", "xxe_billion_laughs.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    errors = data.get("diagnostics", {}).get("errors", data.get("errors", []))
    error_codes = [e.get("code") for e in errors]
    assert any("XXE" in c for c in error_codes) or "ERR_XXE_DOCTYPE_FORBIDDEN" in error_codes


def test_f06_t03_utf16le_encoding_bypass_defense(hub_client, teacher_jwt, fixtures_dir):
    """Verify multi-byte UTF-16LE DOCTYPE payload is blocked."""
    hub_client.set_token(teacher_jwt)
    bin_path = os.path.join(fixtures_dir, "attacks", "xxe_utf16le_bom.bin")
    with open(bin_path, "rb") as f:
        raw_bytes = f.read()

    # Submit multipart raw bytes
    files = {"file": ("xxe_utf16.xml", raw_bytes, "application/xml")}
    resp = hub_client.session.post(
        f"{hub_client.api_base}/packages/preflight",
        files=files,
        headers=hub_client._headers(),
        timeout=15,
    )
    assert resp.status_code in [200, 400]
    data = resp.json()
    assert data.get("valid") is False or data.get("statusCode") == 400


def test_f06_t04_xinclude_proscription(hub_client, teacher_jwt, fixtures_dir):
    """Verify XInclude injection is detected and blocked."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "attacks", "xxe_xinclude_injection.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    errors = data.get("diagnostics", {}).get("errors", data.get("errors", []))
    error_codes = [e.get("code") for e in errors]
    assert "ERR_XXE_XINCLUDE_FORBIDDEN" in error_codes or any("XXE" in c for c in error_codes)


def test_f06_t05_malformed_xml_diagnostics(hub_client, teacher_jwt, fixtures_dir):
    """Verify syntax error produces structured diagnostic report without crashing."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "corrupted", "mismatched_tags.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False
    errors = data.get("diagnostics", {}).get("errors", data.get("errors", []))
    error_codes = [e.get("code") for e in errors]
    assert "ERR_XML_INVALID_SYNTAX" in error_codes or any("SYNTAX" in c or "PARSE" in c for c in error_codes)
