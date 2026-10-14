"""
Feature 05: Teacher Auth, Onboarding & Tokens (ORIGINAL_REQUEST §R2).
Verifies user registration with Swiss educational metadata, session authentication,
profile retrieval, Personal Access Token (PAT) generation, and OAuth 2.0 PKCE flows.
"""

import time
import base64
import hashlib
import secrets
import urllib.parse
import pytest
import requests


def test_f05_t01_teacher_registration(hub_client):
    """Verify teacher registration with institutional metadata."""
    ts = int(time.time() * 1000)
    email = f"teacher_reg_{ts}@kanti.ch"
    payload = {
        "email": email,
        "password": "Password123!",
        "full_name": f"Teacher {ts}",
        "institution": "Kantonsschule Enge",
        "canton": "ZH",
    }
    resp = requests.post(f"{hub_client.api_base}/auth/register", json=payload, timeout=15)
    assert resp.status_code in [200, 201], f"Registration failed: {resp.text}"
    data = resp.json()
    assert "token" in data or "user" in data


def test_f05_t02_teacher_login_and_jwt(hub_client):
    """Verify teacher login returning valid JWT."""
    resp = hub_client.login()
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "user" in data
    assert data["user"]["email"] == "teacher@kanti.ch"
    assert len(data["token"].split(".")) == 3, "Token must be a valid 3-part JWT"


def test_f05_t03_authenticated_profile_me(hub_client, teacher_jwt):
    """Verify /api/v1/auth/me returns profile for authenticated user and 401 for unauthenticated."""
    # 1. Authenticated
    hub_client.set_token(teacher_jwt)
    resp = hub_client.get_me()
    assert resp.status_code == 200
    user = resp.json().get("user", resp.json())
    assert user.get("email") == "teacher@kanti.ch"

    # 2. Unauthenticated
    hub_client.set_token(None)
    unauth_resp = hub_client.get_me()
    assert unauth_resp.status_code == 401


def test_f05_t04_personal_access_token_generation(hub_client, teacher_jwt):
    """Verify Personal Access Token (PAT) generation, prefix, and authentication."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time())
    resp = hub_client.create_pat(name=f"PAT-Tier1-{ts}", expires_in_days=30)
    assert resp.status_code == 201
    data = resp.json()
    token_str = data.get("token", "")
    assert token_str.startswith("mqh_pat_"), f"PAT must start with 'mqh_pat_', got: {token_str[:12]}"

    # Verify PAT works for authentication against /api/v1/auth/me
    hub_client.set_token(token_str)
    me_resp = hub_client.get_me()
    assert me_resp.status_code == 200


def test_f05_t05_oauth_pkce_code_flow_and_replay_protection(hub_url):
    """Verify OAuth 2.0 PKCE authorization code flow and single-use replay protection."""
    client_id = "moodle-plugin-client"
    redirect_uri = "https://moodle-one.in-form-atik.ch/question/bank/questionhub/callback.php"

    code_verifier = secrets.token_urlsafe(40)
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest()).decode("utf-8").rstrip("=")
    state = secrets.token_hex(8)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }

    # 1. Authorize GET expecting 302
    auth_url = f"{hub_url}/oauth/authorize?{urllib.parse.urlencode(params)}"
    auth_resp = requests.get(auth_url, allow_redirects=False, timeout=15)
    assert auth_resp.status_code == 302, f"Expected 302, got {auth_resp.status_code}"
    location = auth_resp.headers.get("Location")
    assert location and location.startswith(redirect_uri)

    parsed_loc = urllib.parse.urlparse(location)
    query_params = urllib.parse.parse_qs(parsed_loc.query)
    assert "code" in query_params
    auth_code = query_params["code"][0]

    # 2. Token exchange POST
    token_url = f"{hub_url}/oauth/token"
    token_payload = {
        "grant_type": "authorization_code",
        "code": auth_code,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
    token_resp = requests.post(token_url, json=token_payload, timeout=15)
    assert token_resp.status_code == 200, f"Token exchange failed: {token_resp.text}"
    token_data = token_resp.json()
    assert "access_token" in token_data
    assert token_data.get("token_type") == "Bearer"

    # 3. Replay attack rejection
    replay_resp = requests.post(token_url, json=token_payload, timeout=15)
    assert replay_resp.status_code == 400, "Replayed authorization code must be rejected"
