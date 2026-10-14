"""
Feature 13: Pre-flight Import Diagnostics (ORIGINAL_REQUEST §R1, TEST_INFRA §F13).
Verifies:
1. Deterministic valid package verification (valid: true, 0 errors, correct counts).
2. Actionable warning for unsupported question types (WARN_UNSUPPORTED_QUESTION_TYPE).
3. Single-choice fraction invariant violation: zero 100% answers (ERR_SINGLE_CHOICE_NO_100).
4. Single-choice fraction invariant violation: multiple 100% answers (ERR_SINGLE_CHOICE_MULTIPLE_100).
5. Cloze syntax violation detection (ERR_CLOZE_SYNTAX_INVALID).
"""

import os
import pytest


def test_f13_t01_deterministic_valid_package(hub_client, teacher_jwt, fixtures_dir):
    """Verify preflight validation passes cleanly on valid packages with type summary."""
    hub_client.set_token(teacher_jwt)
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_multichoice_single.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is True, f"Expected valid=True, got: {data}"
    errors = data.get("diagnostics", {}).get("errors", [])
    assert len(errors) == 0, f"Expected 0 errors, got: {errors}"
    stats = data.get("stats", {})
    assert stats.get("question_count", 0) >= 1
    assert "multichoice" in stats.get("qtypes_breakdown", {})


def test_f13_t02_unsupported_question_type_warning(hub_client, teacher_jwt):
    """Verify package with unknown question type generates WARN_UNSUPPORTED_QUESTION_TYPE."""
    hub_client.set_token(teacher_jwt)
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="geogebra_custom">
    <name><text>Custom GeoGebra Construction</text></name>
    <questiontext><text>Construct an equilateral triangle.</text></questiontext>
  </question>
</quiz>"""
    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    warnings = data.get("diagnostics", {}).get("warnings", [])
    warning_codes = [w.get("code") for w in warnings]
    assert "WARN_UNSUPPORTED_QUESTION_TYPE" in warning_codes, f"Expected WARN_UNSUPPORTED_QUESTION_TYPE in warnings: {warnings}"


def test_f13_t03_single_choice_fraction_no_100(hub_client, teacher_jwt):
    """Verify single-choice question with zero 100% options flags ERR_SINGLE_CHOICE_NO_100."""
    hub_client.set_token(teacher_jwt)
    bad_mc_xml = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoice">
    <name><text>Invalid Single Choice</text></name>
    <questiontext><text>Which is correct?</text></questiontext>
    <single>true</single>
    <answer fraction="50">
      <text>Option A (50%)</text>
    </answer>
    <answer fraction="50">
      <text>Option B (50%)</text>
    </answer>
  </question>
</quiz>"""
    resp = hub_client.preflight(bad_mc_xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False, "Expected valid=False for missing 100% choice"
    errors = data.get("diagnostics", {}).get("errors", [])
    codes = [e.get("code") for e in errors]
    assert "ERR_SINGLE_CHOICE_NO_100" in codes, f"Expected ERR_SINGLE_CHOICE_NO_100 in errors: {codes}"


def test_f13_t04_single_choice_fraction_multiple_100(hub_client, teacher_jwt):
    """Verify single-choice question with multiple 100% options flags ERR_SINGLE_CHOICE_MULTIPLE_100."""
    hub_client.set_token(teacher_jwt)
    bad_mc_xml = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoice">
    <name><text>Invalid Single Choice Multiple 100</text></name>
    <questiontext><text>Which is correct?</text></questiontext>
    <single>true</single>
    <answer fraction="100">
      <text>Option A (100%)</text>
    </answer>
    <answer fraction="100">
      <text>Option B (100%)</text>
    </answer>
  </question>
</quiz>"""
    resp = hub_client.preflight(bad_mc_xml)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False, "Expected valid=False for multiple 100% choices"
    errors = data.get("diagnostics", {}).get("errors", [])
    codes = [e.get("code") for e in errors]
    assert "ERR_SINGLE_CHOICE_MULTIPLE_100" in codes, f"Expected ERR_SINGLE_CHOICE_MULTIPLE_100 in errors: {codes}"


def test_f13_t05_cloze_syntax_violation(hub_client, teacher_jwt, fixtures_dir):
    """Verify malformed Cloze syntax flags ERR_CLOZE_SYNTAX_INVALID."""
    hub_client.set_token(teacher_jwt)
    cloze_path = os.path.join(fixtures_dir, "corrupted", "cloze_unmatched_open_brace.xml")
    with open(cloze_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.preflight(xml_content)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("valid") is False, "Expected valid=False for invalid Cloze syntax"
    errors = data.get("diagnostics", {}).get("errors", [])
    codes = [e.get("code") for e in errors]
    assert "ERR_CLOZE_SYNTAX_INVALID" in codes, f"Expected ERR_CLOZE_SYNTAX_INVALID in errors: {codes}"
