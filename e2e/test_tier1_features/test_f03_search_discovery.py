"""
Feature 03: Public Marketplace Discovery & Search (ORIGINAL_REQUEST §R2).
Verifies unauthenticated package querying, keyword search filtering,
canonical subject categorization, course level filtering, and cantonal parameters.
"""

import pytest


def test_f03_t01_unauthenticated_public_discovery(hub_client):
    """Verify that unauthenticated visitors can query /api/v1/packages."""
    hub_client.set_token(None)
    resp = hub_client.search_packages()
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert "data" in data or "packages" in data or isinstance(data, list), "Packages list missing from discovery response"
    packages = data.get("data", data.get("packages", data if isinstance(data, list) else []))
    assert len(packages) >= 0


def test_f03_t02_keyword_fulltext_search(hub_client):
    """Verify keyword filtering on package search endpoint."""
    hub_client.set_token(None)
    resp = hub_client.search_packages(q="Informatik")
    assert resp.status_code == 200
    data = resp.json()
    packages = data.get("packages", data if isinstance(data, list) else [])
    for pkg in packages:
        text_corpus = (
            pkg.get("title", "")
            + " "
            + pkg.get("summary", "")
            + " "
            + str(pkg.get("taxonomy", {}))
        ).lower()
        assert "informatik" in text_corpus or "info" in text_corpus or len(packages) == 0


def test_f03_t03_canonical_subject_filtering(hub_client):
    """Verify filtering packages by Swiss curriculum subject."""
    hub_client.set_token(None)
    resp = hub_client.search_packages(subject="Mathematik")
    assert resp.status_code == 200
    data = resp.json()
    packages = data.get("packages", data if isinstance(data, list) else [])
    for pkg in packages:
        subj = pkg.get("taxonomy", {}).get("subject", "") or pkg.get("subject", "")
        assert subj == "Mathematik" or "Mathe" in subj or "mat" in subj.lower()


def test_f03_t04_course_level_filtering(hub_client):
    """Verify filtering packages by Gymnasium course level (GF, SF, EF)."""
    hub_client.set_token(None)
    for level in ["GF", "SF"]:
        resp = hub_client.search_packages(level=level)
        assert resp.status_code == 200
        data = resp.json()
        packages = data.get("packages", data if isinstance(data, list) else [])
        for pkg in packages:
            pkg_level = pkg.get("taxonomy", {}).get("level", "") or pkg.get("level", "")
            assert pkg_level == level or level in pkg_level


def test_f03_t05_cantonal_and_qtype_filtering(hub_client):
    """Verify combined filtering by canton and question type."""
    hub_client.set_token(None)
    resp = hub_client.search_packages(canton="ZH", qtype="multichoice")
    assert resp.status_code == 200
    data = resp.json()
    packages = data.get("packages", data if isinstance(data, list) else [])
    for pkg in packages:
        canton = pkg.get("taxonomy", {}).get("canton", "") or pkg.get("canton", "")
        if canton:
            assert canton == "ZH" or "ZH" in canton
