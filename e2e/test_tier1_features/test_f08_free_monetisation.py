"""
Feature 08: Free Community Model & Separable Monetisation (ORIGINAL_REQUEST §R2).
Verifies health status confirms disabled monetisation, free tier access evaluation,
safe public preview redaction of answers/fractions/feedback, and unauthenticated free downloads.
"""

import pytest
import requests


def test_f08_t01_disabled_monetisation_in_health(hub_client):
    """Verify health endpoint confirms monetisation is strictly disabled."""
    resp = hub_client.health()
    assert resp.status_code == 200
    data = resp.json()
    assert "monetisation" in data
    assert data["monetisation"].get("enabled") is False


def test_f08_t02_free_tier_access_decision(hub_client):
    """Verify packages are unconditionally accessible without payment subscriptions."""
    # Query package search as unauthenticated guest
    hub_client.set_token(None)
    resp = hub_client.search_packages()
    assert resp.status_code == 200
    packages = resp.json().get("data", resp.json().get("packages", []))
    assert len(packages) > 0

    # Every package has free access
    for pkg in packages[:3]:
        assert pkg.get("pricing_type", "free") == "free" or pkg.get("price", 0) == 0


def test_f08_t03_public_preview_redaction(hub_client):
    """Verify public preview strips correct answers, fractions, and grader feedback."""
    hub_client.set_token(None)
    # Get any available package
    list_resp = hub_client.search_packages()
    packages = list_resp.json().get("data", list_resp.json().get("packages", []))
    assert len(packages) > 0
    pkg_id = packages[0]["id"]

    prev_resp = hub_client.get_preview(pkg_id)
    assert prev_resp.status_code == 200
    preview = prev_resp.json()

    for q in preview.get("questions", []):
        # Options should only contain option ID and text, no fractions or scores
        for opt in q.get("options", []):
            assert "fraction" not in opt, "Fraction leaked in public preview option"
            assert "score" not in opt, "Score leaked in public preview option"
            assert "is_correct" not in opt, "is_correct leaked in public preview option"
            assert "correct" not in opt, "correct flag leaked in public preview option"
            assert "feedback" not in opt, "Feedback leaked in public preview option"


def test_f08_t04_unauthenticated_free_download(hub_client):
    """Verify packages can be downloaded completely without authentication or payment."""
    hub_client.set_token(None)
    list_resp = hub_client.search_packages()
    packages = list_resp.json().get("data", list_resp.json().get("packages", []))
    assert len(packages) > 0
    pkg = packages[0]

    version = pkg.get("latest_version") or (pkg.get("releases", [{}])[0].get("version", "1.0.0"))
    down_resp = hub_client.download_release(pkg["id"], version)
    assert down_resp.status_code == 200
    assert "<quiz>" in down_resp.text or "<?xml" in down_resp.text


def test_f08_t05_commercial_checkout_decoupling(hub_client):
    """Verify commercial checkout endpoints are cleanly rejected or unavailable."""
    hub_client.set_token(None)
    resp = hub_client.session.post(f"{hub_client.api_base}/checkout", json={"package_id": "test"}, timeout=15)
    # Should return 404 Not Found, 400 Bad Request, or 403 Forbidden
    assert resp.status_code in [400, 403, 404, 405]
