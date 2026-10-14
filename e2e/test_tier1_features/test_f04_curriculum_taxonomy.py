"""
Feature 04: Swiss Gymnasium Curriculum Taxonomy (ORIGINAL_REQUEST §R2).
Verifies the canonical 15 EDK RLP subjects, subject codes including Italienisch/Latein,
gymnasial course levels (GF, SF, EF, FF), grade levels (GYM1-GYM4), and cantonal coverage.
"""

import pytest


def test_f04_t01_canonical_15_subjects(hub_client):
    """Verify taxonomy contains exactly the 15 canonical EDK Framework Curriculum subjects."""
    resp = hub_client.get_taxonomy()
    assert resp.status_code == 200
    data = resp.json()
    subjects = data.get("subjects", [])
    assert len(subjects) == 15, f"Expected 15 subjects, got {len(subjects)}"

    names_de = [s.get("name_de") for s in subjects]
    canonical = [
        "Informatik", "Mathematik", "Physik", "Biologie", "Chemie",
        "Deutsch", "Französisch", "Englisch", "Geschichte", "Geografie",
        "Bildnerisches Gestalten", "Musik", "Wirtschaft und Recht",
        "Italienisch", "Latein",
    ]
    for c in canonical:
        assert c in names_de, f"Missing canonical subject {c}"


def test_f04_t02_italian_and_latin_codes_and_topics(hub_client):
    """Verify Italienisch (ITA) and Latein (LAT) are present with valid topics."""
    resp = hub_client.get_taxonomy()
    assert resp.status_code == 200
    subjects = resp.json().get("subjects", [])

    ita = next((s for s in subjects if s.get("code") == "ITA"), None)
    lat = next((s for s in subjects if s.get("code") == "LAT"), None)

    assert ita is not None, "Subject code ITA missing"
    assert lat is not None, "Subject code LAT missing"
    assert ita.get("name_de") == "Italienisch"
    assert lat.get("name_de") == "Latein"
    assert len(ita.get("topics", [])) > 0, "Italienisch has 0 topics"
    assert len(lat.get("topics", [])) > 0, "Latein has 0 topics"


def test_f04_t03_course_levels(hub_client):
    """Verify Gymnasium course levels include GF, SF, EF, FF."""
    resp = hub_client.get_taxonomy()
    assert resp.status_code == 200
    levels = resp.json().get("course_levels", [])
    codes = [lvl.get("code") for lvl in levels]

    for expected in ["GF", "SF", "EF", "FF"]:
        assert expected in codes, f"Expected course level {expected} missing"


def test_f04_t04_grade_levels_harmos(hub_client):
    """Verify grade levels (GYM1–GYM4) and HarmoS year alignment."""
    resp = hub_client.get_taxonomy()
    assert resp.status_code == 200
    grades = resp.json().get("grade_levels", [])
    codes = [g.get("code") for g in grades]

    assert len(grades) == 4
    assert codes == ["GYM1", "GYM2", "GYM3", "GYM4"]
    for g in grades:
        assert g.get("school_year") in [9, 10, 11, 12]
        assert g.get("harmos_year") in [11, 12, 13, 14]


def test_f04_t05_cantonal_coverage(hub_client):
    """Verify cantons list contains valid Swiss 2-letter postal codes."""
    resp = hub_client.get_taxonomy()
    assert resp.status_code == 200
    cantons = resp.json().get("cantons", [])
    assert len(cantons) >= 20

    codes = [c.get("code") for c in cantons]
    major_cantons = ["ZH", "BE", "LU", "BS", "BL", "SG", "AG", "SO", "TG", "GR"]
    for m in major_cantons:
        assert m in codes, f"Canton {m} missing from taxonomy"
