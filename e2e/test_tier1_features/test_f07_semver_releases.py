"""
Feature 07: Immutable SemVer Releases & SHA-256 Integrity Checksums (ORIGINAL_REQUEST §R2).
Verifies publishing initial releases, SHA-256 digest validation, HTTP 409 conflict
on re-upload attempts, SemVer version bump precedence, and immutable caching headers.
"""

import os
import time
import hashlib
import pytest


def test_f07_t01_initial_release_publication(hub_client, teacher_jwt, fixtures_dir):
    """Verify publishing version 1.0.0 creates valid immutable release."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.semver.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"SemVer Test {ts}",
        "summary": "Initial SemVer 1.0.0 release",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_multichoice_single.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    resp = hub_client.publish_package(metadata, xml_content)
    assert resp.status_code == 201
    data = resp.json()
    assert data.get("package_id") == pkg_id
    assert data.get("version") == "1.0.0"
    assert len(data.get("sha256", "")) == 64


def test_f07_t02_sha256_digest_integrity(hub_client, teacher_jwt, fixtures_dir):
    """Verify SHA-256 digest matches local SHA-256 of uploaded XML."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.sha.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"SHA Integrity Test {ts}",
        "summary": "Testing checksum accuracy",
        "language": "de-CH",
        "taxonomy": {"subject": "Mathematik", "level": "SF", "canton": "ZH"},
    }
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_numerical.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    expected_sha = hashlib.sha256(xml_content.encode("utf-8")).hexdigest()

    resp = hub_client.publish_package(metadata, xml_content)
    assert resp.status_code == 201
    assert resp.json().get("sha256") == expected_sha


def test_f07_t03_release_immutability_conflict(hub_client, teacher_jwt, fixtures_dir):
    """Verify re-publishing the identical version returns HTTP 409 Conflict."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.conflict.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"Conflict Test {ts}",
        "summary": "First upload",
        "language": "de-CH",
        "taxonomy": {"subject": "Physik", "level": "EF", "canton": "ZH"},
    }
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_truefalse.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    # First publish: 201
    resp1 = hub_client.publish_package(metadata, xml_content)
    assert resp1.status_code == 201

    # Second publish with same version: 409
    metadata["summary"] = "Altered summary attempting overwrite"
    resp2 = hub_client.publish_package(metadata, xml_content)
    assert resp2.status_code == 409, f"Expected 409 Conflict, got {resp2.status_code}"


def test_f07_t04_semver_precedence_enforcement(hub_client, teacher_jwt, fixtures_dir):
    """Verify version downgrade (0.9.0) is rejected, while upgrade (1.1.0) is accepted."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.precedence.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"Precedence Test {ts}",
        "summary": "Base 1.0.0",
        "language": "de-CH",
        "taxonomy": {"subject": "Chemie", "level": "SF", "canton": "ZH"},
    }
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_essay.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    # 1. Base 1.0.0
    assert hub_client.publish_package(metadata, xml_content).status_code == 201

    # 2. Downgrade 0.9.0 -> Rejected (400 or 409)
    metadata["version"] = "0.9.0"
    resp_down = hub_client.publish_package(metadata, xml_content)
    assert resp_down.status_code in [400, 409], f"Expected rejection of downgrade, got {resp_down.status_code}"

    # 3. Upgrade 1.1.0 -> Accepted (201)
    metadata["version"] = "1.1.0"
    resp_up = hub_client.publish_package(metadata, xml_content)
    assert resp_up.status_code == 201


def test_f07_t05_release_download_and_etag_caching(hub_client, teacher_jwt, fixtures_dir):
    """Verify download serves accurate content, ETag, and handles conditional 304."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.download.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"Download ETag Test {ts}",
        "summary": "Checking ETag headers",
        "language": "de-CH",
        "taxonomy": {"subject": "Biologie", "level": "SF", "canton": "ZH"},
    }
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_matching.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    pub_resp = hub_client.publish_package(metadata, xml_content)
    assert pub_resp.status_code == 201
    sha = pub_resp.json()["sha256"]

    # 1. Download
    down_resp = hub_client.download_release(pkg_id, "1.0.0")
    assert down_resp.status_code == 200
    assert "xml" in down_resp.headers.get("content-type", "").lower()
    etag = down_resp.headers.get("etag")
    assert etag is not None
    assert sha in etag

    # 2. Conditional request with If-None-Match
    cond_resp = hub_client.download_release(pkg_id, "1.0.0", headers={"If-None-Match": etag})
    assert cond_resp.status_code == 304
