"""
Tier 3 Combinations Suite 1: Auth & Packaging Lifecycle (ORIGINAL_REQUEST §R1, §R2).
Verifies:
1. End-to-end PAT generation, export, publication, and SHA-256 verified download.
2. PAT revocation and re-authentication resilience.
3. Multi-release SemVer progression (1.0.0 -> 1.0.1 -> 1.1.0).
4. Immutable release conflict rejection (HTTP 409).
5. Institutional token fallback in plugin auth_manager.
6. Unauthenticated discovery, preview, and ETag conditional download (HTTP 304).
"""

import os
import time
import json
import hashlib
import pytest


def test_t3_01_teacher_pat_publish_and_sha256_download(hub_client, teacher_jwt, remote_php):
    """T3.01: End-to-end PAT creation, M1 export, publication, and byte-verified download."""
    ts = int(time.time() * 1000)
    hub_client.set_token(teacher_jwt)

    # 1. Create a PAT
    pat_resp = hub_client.create_pat(name=f"t3_01_pat_{ts}", expires_in_days=30)
    assert pat_resp.status_code == 201
    pat_token = pat_resp.json()["token"]
    assert pat_token.startswith("mqh_pat_")

    # 2. Export XML from Moodle 1
    php_code = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-one/config.php');
    $exporter = new \\qbank_questionhub\\package_exporter(2);
    $q = $DB->get_record_sql("SELECT id FROM {question} WHERE qtype != :top LIMIT 1", ["top" => "category"]);
    $xml = $exporter->export_questions_xml([$q->id]);
    echo json_encode(['xml' => $xml]);
    """
    res = remote_php(php_code, php_bin="php8.2")
    assert res.returncode == 0
    xml_content = json.loads(res.stdout[res.stdout.find("{"):])["xml"]

    # 3. Publish using PAT
    hub_client.set_token(pat_token)
    pkg_id = f"ch.gym.zh.t3.authpub.{ts}"
    metadata = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"T3 AuthPub {ts}",
        "summary": "T3.01 publication test",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    pub_resp = hub_client.publish_package(metadata=metadata, xml_content=xml_content)
    assert pub_resp.status_code == 201, f"Publish failed: {pub_resp.text}"
    published_sha = pub_resp.json().get("sha256")

    # 4. Download and verify SHA-256
    dl_resp = hub_client.download_release(pkg_id, "1.0.0")
    assert dl_resp.status_code == 200
    calc_sha = hashlib.sha256(dl_resp.content).hexdigest()
    assert calc_sha == published_sha


def test_t3_02_pat_revocation_mid_flight(hub_client, teacher_jwt):
    """T3.02: Verify revoked PAT immediately fails authentication with HTTP 401."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)

    # 1. Create PAT
    pat_resp = hub_client.create_pat(name=f"revokable_pat_{ts}", expires_in_days=7)
    assert pat_resp.status_code == 201
    pat_data = pat_resp.json()
    pat_id = pat_data.get("id")
    pat_token = pat_data.get("token")

    # 2. Verify token is active
    hub_client.set_token(pat_token)
    me_resp = hub_client.get_me()
    assert me_resp.status_code == 200

    # 3. Revoke PAT using teacher session
    hub_client.set_token(teacher_jwt)
    del_resp = hub_client.revoke_pat(pat_id)
    assert del_resp.status_code in [200, 204]

    # 4. Verify revoked PAT is rejected
    hub_client.set_token(pat_token)
    rejected_resp = hub_client.get_me()
    assert rejected_resp.status_code == 401


def test_t3_03_semver_progression_patch_minor(hub_client, teacher_jwt, fixtures_dir):
    """T3.03: Multi-release SemVer progression (1.0.0 -> 1.0.1 -> 1.1.0)."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.t3.semver.{ts}"
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_truefalse.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    # 1. Initial 1.0.0
    meta_1 = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"SemVer Flow {ts}",
        "summary": "Release 1.0.0",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    r1 = hub_client.publish_package(meta_1, xml_content)
    assert r1.status_code == 201

    # 2. Patch 1.0.1
    meta_2 = dict(meta_1, version="1.0.1", summary="Patch release 1.0.1")
    r2 = hub_client.publish_package(meta_2, xml_content)
    assert r2.status_code == 201

    # 3. Minor 1.1.0
    meta_3 = dict(meta_1, version="1.1.0", summary="Minor release 1.1.0")
    r3 = hub_client.publish_package(meta_3, xml_content)
    assert r3.status_code == 201

    # 4. Verify catalog reflection
    pkg = hub_client.get_package(pkg_id).json()
    assert pkg.get("latest_version") == "1.1.0"
    releases = pkg.get("releases", [])
    assert len(releases) == 3


def test_t3_04_immutable_release_conflict(hub_client, teacher_jwt, fixtures_dir):
    """T3.04: Re-publishing an existing version returns HTTP 409 Conflict."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.t3.immutable.{ts}"
    xml_path = os.path.join(fixtures_dir, "packages", "minimal_truefalse.xml")
    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    meta = {
        "id": pkg_id,
        "version": "1.0.0",
        "title": f"Immutable Test {ts}",
        "summary": "Initial release",
        "language": "de-CH",
        "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"},
    }
    r1 = hub_client.publish_package(meta, xml_content)
    assert r1.status_code == 201

    # Attempt re-publish
    r2 = hub_client.publish_package(meta, xml_content)
    assert r2.status_code == 409, f"Expected 409 Conflict, got: {r2.status_code} {r2.text}"


def test_t3_05_institutional_token_fallback(remote_php):
    """T3.05: Verify auth_manager resolves institutional token when user token is empty."""
    php_code = """
    define('CLI_SCRIPT', true);
    require_once('/mnt/HC_Volume_100926434/www/moodle-two/config.php');
    set_config('institutiontoken', 'mqh_pat_institution_fallback_test', 'qbank_questionhub');
    $token = \\qbank_questionhub\\auth_manager::resolve_active_token(999999);
    echo json_encode([
        'resolved' => $token,
        'matches' => ($token === 'mqh_pat_institution_fallback_test')
    ]);
    """
    res = remote_php(php_code, php_bin="php8.1")
    assert res.returncode == 0
    data = json.loads(res.stdout[res.stdout.find("{"):])
    assert data["matches"] is True, f"Failed institutional token fallback: {data}"


def test_t3_06_unauthenticated_discovery_and_etag(hub_client):
    """T3.06: Verify unauthenticated search, preview, and ETag conditional download (HTTP 304)."""
    # Unauthenticated client
    hub_client.set_token("")

    # 1. Search
    search_resp = hub_client.search_packages(subject="Informatik")
    assert search_resp.status_code == 200
    res_json = search_resp.json()
    packages = res_json.get("data", [])
    assert len(packages) >= 1
    pkg = packages[0]
    pkg_id = pkg.get("id")
    version = pkg.get("latest_version") or "1.0.0"

    # 2. Preview
    prev_resp = hub_client.get_preview(pkg_id)
    assert prev_resp.status_code == 200

    # 3. Download & ETag
    dl_resp = hub_client.download_release(pkg_id, version)
    assert dl_resp.status_code == 200
    etag = dl_resp.headers.get("ETag") or dl_resp.headers.get("etag")
    if etag:
        cond_resp = hub_client.download_release(pkg_id, version, headers={"If-None-Match": etag})
        assert cond_resp.status_code == 304, f"Expected 304 Not Modified, got: {cond_resp.status_code}"
