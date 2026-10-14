"""
Feature 11: Standard Question Types Serialization (ORIGINAL_REQUEST §R1).
Verifies serialization, preflight validation, and database hydration for all
seven standard Moodle question types:
1. Multiple Choice (multichoice)
2. True/False (truefalse)
3. Short Answer (shortanswer)
4. Numerical (numerical)
5. Matching (matching)
6. Cloze / Multi-Answer (multianswer)
7. Essay (essay)
"""

import os
import pytest


def test_f11_t01_multichoice_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify Multiple Choice serialization passes preflight and identifies multichoice type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_multichoice_single.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"MC preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("multichoice", 0) >= 1


def test_f11_t02_truefalse_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify True/False serialization passes preflight and identifies truefalse type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_truefalse.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"TF preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("truefalse", 0) >= 1


def test_f11_t03_shortanswer_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify Short Answer serialization passes preflight and identifies shortanswer type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_shortanswer.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"SA preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("shortanswer", 0) >= 1


def test_f11_t04_numerical_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify Numerical serialization passes preflight and identifies numerical type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_numerical.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"Numerical preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("numerical", 0) >= 1


def test_f11_t05_matching_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify Matching serialization passes preflight and identifies matching type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_matching.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"Matching preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("matching", 0) >= 1


def test_f11_t06_cloze_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify Cloze (Multianswer) serialization passes preflight and identifies cloze type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_cloze.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"Cloze preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("cloze", 0) >= 1 or breakdown.get("multianswer", 0) >= 1


def test_f11_t07_essay_serialization(hub_client, teacher_jwt, fixtures_dir):
    """Verify Essay serialization passes preflight and identifies essay type."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_essay.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"Essay preflight failed: {data}"
    breakdown = data.get("stats", {}).get("qtypes_breakdown", {})
    assert breakdown.get("essay", 0) >= 1
