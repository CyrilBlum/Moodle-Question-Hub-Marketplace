"""
Pytest configuration and shared testbed fixtures for Moodle Question Hub E2E test suite.
Provides resilient HTTP clients with exponential backoff on HTTP 429,
live session cookies, SSH command runners, and test fixture helpers.
"""

import os
import sys
import time
import json
import subprocess
from typing import Dict, Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import pytest

# Default target URLs
DEFAULT_MOODLE1_URL = "https://moodle-one.in-form-atik.ch"
DEFAULT_MOODLE2_URL = "https://moodle-two.in-form-atik.ch"
DEFAULT_HUB_URL = "https://hub.cblum.ch"

# Test credentials come from the environment (never committed). See e2e/README.md.
def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise pytest.UsageError(f"Environment variable {name} is required for the E2E suite (see e2e/README.md)")
    return value


DEFAULT_TEACHER_EMAIL = os.environ.get("QHUB_TEACHER_EMAIL", "c@cblum.ch")
DEFAULT_MOODLE_TEACHER_USER = os.environ.get("QHUB_MOODLE_TEACHER_USER", "teacher1")


def pytest_addoption(parser):
    """Register custom command-line options."""
    parser.addoption(
        "--moodle1-url",
        action="store",
        default=DEFAULT_MOODLE1_URL,
        help="Base URL for Moodle 1 (Moodle 5.0)",
    )
    parser.addoption(
        "--moodle2-url",
        action="store",
        default=DEFAULT_MOODLE2_URL,
        help="Base URL for Moodle 2 (Moodle 4.5 LTS)",
    )
    parser.addoption(
        "--hub-url",
        action="store",
        default=DEFAULT_HUB_URL,
        help="Base URL for Marketplace Hub",
    )


@pytest.fixture(scope="session")
def moodle1_url(request) -> str:
    return request.config.getoption("--moodle1-url").rstrip("/")


@pytest.fixture(scope="session")
def moodle2_url(request) -> str:
    return request.config.getoption("--moodle2-url").rstrip("/")


@pytest.fixture(scope="session")
def hub_url(request) -> str:
    return request.config.getoption("--hub-url").rstrip("/")


@pytest.fixture(scope="session")
def fixtures_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "fixtures"))


def create_retry_session(
    retries: int = 5,
    backoff_factor: float = 1.5,
    status_forcelist: tuple = (429, 502, 503, 504),
) -> requests.Session:
    """Create requests Session with connection pooling and exponential backoff."""
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=20,
        pool_maxsize=50,
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


class HubClient:
    """Opaque-box client for the Marketplace REST API with rate-limiting resilience."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.api_base = f"{self.base_url}/api/v1"
        self.session = create_retry_session()
        self.auth_token: Optional[str] = None

    def set_token(self, token: str):
        self.auth_token = token

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {"User-Agent": "MoodleQuestionHub-E2E/1.0"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        if extra:
            headers.update(extra)
        return headers

    def health(self) -> requests.Response:
        return self.session.get(f"{self.api_base}/health", headers=self._headers(), timeout=15)

    def login(
        self,
        email: str = DEFAULT_TEACHER_EMAIL,
        password: Optional[str] = None,
    ) -> requests.Response:
        password = password or _required_env("QHUB_TEACHER_PASSWORD")
        url = f"{self.api_base}/auth/login"
        resp = self.session.post(
            url,
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                self.set_token(data["token"])
        return resp

    def get_me(self) -> requests.Response:
        return self.session.get(f"{self.api_base}/auth/me", headers=self._headers(), timeout=15)

    def create_pat(
        self,
        name: str = "Test-PAT",
        expires_in_days: int = 30,
    ) -> requests.Response:
        url = f"{self.api_base}/account/tokens"
        return self.session.post(
            url,
            json={"name": name, "expires_in_days": expires_in_days},
            headers=self._headers({"Content-Type": "application/json"}),
            timeout=15,
        )

    def revoke_pat(self, token_id: str) -> requests.Response:
        url = f"{self.api_base}/account/tokens/{token_id}"
        return self.session.delete(url, headers=self._headers(), timeout=15)

    def get_taxonomy(self) -> requests.Response:
        return self.session.get(f"{self.api_base}/taxonomy", headers=self._headers(), timeout=15)

    def search_packages(self, **params) -> requests.Response:
        return self.session.get(
            f"{self.api_base}/packages",
            params=params,
            headers=self._headers(),
            timeout=15,
        )

    def get_package(self, package_id: str) -> requests.Response:
        return self.session.get(
            f"{self.api_base}/packages/{package_id}",
            headers=self._headers(),
            timeout=15,
        )

    def get_preview(self, package_id: str) -> requests.Response:
        return self.session.get(
            f"{self.api_base}/packages/{package_id}/preview",
            headers=self._headers(),
            timeout=15,
        )

    def preflight(self, xml_content: str) -> requests.Response:
        files = {
            "file": ("package.xml", xml_content, "application/xml"),
        }
        return self.session.post(
            f"{self.api_base}/packages/preflight",
            files=files,
            headers=self._headers(),
            timeout=20,
        )

    def publish_package(
        self,
        metadata: Dict[str, Any],
        xml_content: str,
    ) -> requests.Response:
        files = {
            "file": ("package.xml", xml_content, "application/xml"),
        }
        data = {
            "metadata": json.dumps(metadata) if isinstance(metadata, dict) else metadata,
        }
        return self.session.post(
            f"{self.api_base}/packages",
            data=data,
            files=files,
            headers=self._headers(),
            timeout=20,
        )

    def download_release(
        self,
        package_id: str,
        version: str,
        headers: Optional[Dict[str, str]] = None,
    ) -> requests.Response:
        req_headers = self._headers(headers)
        return self.session.get(
            f"{self.api_base}/packages/{package_id}/releases/{version}/download",
            headers=req_headers,
            timeout=20,
        )


class MoodleClient:
    """Client for testing Moodle web endpoints with form login and session management."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session = create_retry_session()

    def get_login_token(self) -> Optional[str]:
        resp = self.session.get(f"{self.base_url}/login/index.php", timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")
        token_el = soup.find("input", {"name": "logintoken"})
        return token_el["value"] if token_el and "value" in token_el.attrs else None

    def login(self, username: str, password: str) -> bool:
        token = self.get_login_token()
        resp = self.session.post(
            f"{self.base_url}/login/index.php",
            data={
                "anchor": "",
                "logintoken": token or "",
                "username": username,
                "password": password,
            },
            allow_redirects=True,
            timeout=15,
        )
        return "login/index.php" not in resp.url or "loginredirect=1" not in resp.url

    def get_view_page(self, courseid: int = 2) -> requests.Response:
        return self.session.get(
            f"{self.base_url}/question/bank/questionhub/view.php?courseid={courseid}",
            timeout=15,
        )

    def get_publish_page(self, courseid: int = 2) -> requests.Response:
        return self.session.get(
            f"{self.base_url}/question/bank/questionhub/publish.php?courseid={courseid}",
            timeout=15,
        )


def run_hetzner_ssh(cmd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    """Executes a command on the Hetzner testbed server via SSH."""
    full_cmd = ["ssh", "-o", "ConnectTimeout=10", "hetzner", cmd]
    return subprocess.run(full_cmd, capture_output=True, text=True, timeout=timeout)


def run_remote_php(code: str, php_bin: str = "php8.2", timeout: int = 60) -> subprocess.CompletedProcess:
    """Executes PHP code on Hetzner by base64-encoding the snippet to prevent shell escaping issues."""
    import base64
    b64 = base64.b64encode(code.strip().encode("utf-8")).decode("ascii")
    cmd = f"{php_bin} -r 'eval(base64_decode(\"{b64}\"));'"
    return run_hetzner_ssh(cmd, timeout=timeout)


HARNESS_PATH = "/mnt/HC_Volume_100926434/moodle_quiz_harness.php"

# Moodle testbeds on Hetzner: code root and matching PHP binary.
MOODLE_INSTANCES = {
    "m1": {"root": "/mnt/HC_Volume_100926434/www/moodle-one", "php": "php8.2", "label": "Moodle 1 (5.0)"},
    "m2": {"root": "/mnt/HC_Volume_100926434/www/moodle-two", "php": "php8.1", "label": "Moodle 2 (4.5 LTS)"},
}


def run_harness(instance: str, action: str, payload: Dict[str, Any], timeout: int = 120) -> Dict[str, Any]:
    """Runs a moodle_quiz_harness.php action on a Moodle instance ('m1'/'m2') and returns its JSON output."""
    moodle = MOODLE_INSTANCES[instance]
    cmd = f"{moodle['php']} {HARNESS_PATH} {moodle['root']} {action} '{json.dumps(payload)}'"
    res = run_hetzner_ssh(cmd, timeout=timeout)
    output = res.stdout.strip()
    json_start = output.find("{")
    assert res.returncode == 0 and json_start != -1, (
        f"Harness '{action}' failed on {moodle['label']}: {res.stderr}\n{output}"
    )
    return json.loads(output[json_start:])


@pytest.fixture(scope="session", autouse=True)
def moodle_test_data_cleanup():
    """Deletes all quizzes, questions, categories and Question Hub records the test session created
    on both Moodle testbeds.

    Set QHUB_KEEP_TEST_DATA=1 to keep the data for debugging.
    """
    snapshots = {name: run_harness(name, "snapshot", {}) for name in MOODLE_INSTANCES}
    for name in MOODLE_INSTANCES:
        # Export tests need at least one exportable question; do not depend on leftovers.
        print(f"\n[seed] {name}: {run_harness(name, 'seed_default_question', {'courseid': 2})}")
    yield
    if os.environ.get("QHUB_KEEP_TEST_DATA") == "1":
        return
    for name, snap in snapshots.items():
        result = run_harness(name, "cleanup_since", {
            "maxquizid": snap["maxquizid"],
            "maxquestionid": snap["maxquestionid"],
            "maxcategoryid": snap["maxcategoryid"],
            "maxhistoryid": snap["maxhistoryid"],
            "maxitemid": snap["maxitemid"],
        }, timeout=600)
        print(f"\n[cleanup] {MOODLE_INSTANCES[name]['label']}: {result}")


@pytest.fixture(scope="session", autouse=True)
def hub_test_data_cleanup(request):
    """Withdraws every Hub package the teacher account published during the session."""
    client = HubClient(request.getfixturevalue("hub_url"))
    login = client.login()
    if login.status_code != 200:
        yield
        return

    def owned():
        r = client.session.get(f"{client.api_base}/account/packages", headers=client._headers(), timeout=30)
        return {p["id"] for p in r.json().get("data", [])} if r.status_code == 200 else set()

    before = owned()
    yield
    if os.environ.get("QHUB_KEEP_TEST_DATA") == "1":
        return
    removed = 0
    for pkg_id in sorted(owned() - before):
        r = client.session.delete(f"{client.api_base}/packages/{pkg_id}", headers=client._headers(), timeout=30)
        removed += r.status_code == 204
    print(f"\n[cleanup] Hub: {removed} test packages withdrawn")


@pytest.fixture(scope="session")
def hetzner_ssh():
    """Fixture providing SSH command execution on Hetzner."""
    return run_hetzner_ssh


@pytest.fixture(scope="session")
def remote_php():
    """Fixture providing resilient PHP execution on Hetzner."""
    return run_remote_php


@pytest.fixture(scope="session")
def hub_client(hub_url) -> HubClient:
    client = HubClient(hub_url)
    return client


@pytest.fixture(scope="session")
def teacher_jwt(hub_client) -> str:
    """Session fixture returning a valid JWT for the teacher account."""
    resp = hub_client.login()
    assert resp.status_code == 200, f"Teacher login failed: {resp.text}"
    return resp.json()["token"]


@pytest.fixture(scope="session")
def teacher_pat(hub_client, teacher_jwt) -> str:
    """Session fixture generating a Personal Access Token (PAT)."""
    ts = int(time.time())
    hub_client.set_token(teacher_jwt)
    resp = hub_client.create_pat(name=f"e2e_pat_{ts}", expires_in_days=30)
    assert resp.status_code == 201, f"PAT creation failed: {resp.text}"
    return resp.json()["token"]


@pytest.fixture(scope="session")
def moodle1_client(moodle1_url) -> MoodleClient:
    return MoodleClient(moodle1_url)


@pytest.fixture(scope="session")
def moodle2_client(moodle2_url) -> MoodleClient:
    return MoodleClient(moodle2_url)


@pytest.fixture(scope="session")
def m1_teacher_session(moodle1_url) -> MoodleClient:
    client = MoodleClient(moodle1_url)
    success = client.login(DEFAULT_MOODLE_TEACHER_USER, _required_env("QHUB_MOODLE_TEACHER_PASSWORD"))
    assert success, f"Teacher login failed on Moodle 1 ({moodle1_url})"
    return client


@pytest.fixture(scope="session")
def m2_teacher_session(moodle2_url) -> MoodleClient:
    client = MoodleClient(moodle2_url)
    success = client.login(DEFAULT_MOODLE_TEACHER_USER, _required_env("QHUB_MOODLE_TEACHER_PASSWORD"))
    assert success, f"Teacher login failed on Moodle 2 ({moodle2_url})"
    return client


@pytest.fixture(scope="session")
def m1_admin_session(moodle1_url) -> MoodleClient:
    client = MoodleClient(moodle1_url)
    success = client.login("admin", _required_env("QHUB_M1_ADMIN_PASSWORD"))
    assert success, f"Admin login failed on Moodle 1 ({moodle1_url})"
    return client


@pytest.fixture(scope="session")
def m2_admin_session(moodle2_url) -> MoodleClient:
    client = MoodleClient(moodle2_url)
    success = client.login("admin", _required_env("QHUB_M2_ADMIN_PASSWORD"))
    assert success, f"Admin login failed on Moodle 2 ({moodle2_url})"
    return client
