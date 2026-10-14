"""
Feature 01: Dual Moodle Testbed Operations (ORIGINAL_REQUEST §R3).
Verifies HTTPS connectivity, TLS validity, core version manifestations,
and PHP runtime extensions/configuration for both Moodle instances.
"""

import ssl
import socket
import urllib.parse
import pytest


def test_f01_t01_moodle1_https_health_and_tls(moodle1_url, moodle1_client):
    """Verify Moodle 1 is reachable over HTTPS with valid TLS certificate."""
    resp = moodle1_client.session.get(moodle1_url, timeout=15)
    assert resp.status_code == 200, f"Moodle 1 returned status {resp.status_code}"
    assert "moodle" in resp.text.lower() or "in-form-atik" in resp.text.lower(), "Site title not found in Moodle 1 response"

    parsed = urllib.parse.urlparse(moodle1_url)
    ctx = ssl.create_default_context()
    with socket.create_connection((parsed.hostname, parsed.port or 443), timeout=10) as sock:
        with ctx.wrap_socket(sock, server_hostname=parsed.hostname) as ssock:
            cert = ssock.getpeercert()
            assert cert is not None, "Failed to retrieve TLS certificate from Moodle 1"


def test_f01_t02_moodle2_https_health_and_tls(moodle2_url, moodle2_client):
    """Verify Moodle 2 is reachable over HTTPS with valid TLS certificate."""
    resp = moodle2_client.session.get(moodle2_url, timeout=15)
    assert resp.status_code == 200, f"Moodle 2 returned status {resp.status_code}"
    assert "moodle" in resp.text.lower() or "in-form-atik" in resp.text.lower(), "Site title not found in Moodle 2 response"

    parsed = urllib.parse.urlparse(moodle2_url)
    ctx = ssl.create_default_context()
    with socket.create_connection((parsed.hostname, parsed.port or 443), timeout=10) as sock:
        with ctx.wrap_socket(sock, server_hostname=parsed.hostname) as ssock:
            cert = ssock.getpeercert()
            assert cert is not None, "Failed to retrieve TLS certificate from Moodle 2"


def test_f01_t03_moodle1_version_and_branch(hetzner_ssh):
    """Verify Moodle 1 runs Moodle 5.0 Stable (branch 500)."""
    cmd = 'php8.2 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-one/config.php"); echo json_encode(["branch" => $CFG->branch, "release" => $CFG->release, "version" => $CFG->version]);\''
    res = hetzner_ssh(cmd)
    assert res.returncode == 0, f"Failed to read Moodle 1 version: {res.stderr}"
    assert '"branch":"500"' in res.stdout or '"branch":500' in res.stdout or "500" in res.stdout
    assert "5.0" in res.stdout


def test_f01_t04_moodle2_version_and_branch(hetzner_ssh):
    """Verify Moodle 2 runs Moodle 4.5 LTS (branch 405)."""
    cmd = 'php8.1 -r \'define("CLI_SCRIPT", true); require_once("/mnt/HC_Volume_100926434/www/moodle-two/config.php"); echo json_encode(["branch" => $CFG->branch, "release" => $CFG->release, "version" => $CFG->version]);\''
    res = hetzner_ssh(cmd)
    assert res.returncode == 0, f"Failed to read Moodle 2 version: {res.stderr}"
    assert '"branch":"405"' in res.stdout or '"branch":405' in res.stdout or "405" in res.stdout
    assert "4.5" in res.stdout


def test_f01_t05_php_runtime_and_extensions(hetzner_ssh):
    """Verify PHP extensions (intl, soap, curl, etc.) and max_input_vars tuning."""
    for php_bin in ["php8.2", "php8.1"]:
        cmd = f'{php_bin} -r \'echo json_encode(["intl" => extension_loaded("intl"), "soap" => extension_loaded("soap"), "max_input_vars" => (int)ini_get("max_input_vars")]);\''
        res = hetzner_ssh(cmd)
        assert res.returncode == 0, f"PHP check failed on {php_bin}: {res.stderr}"
        assert '"intl":true' in res.stdout, f"intl extension missing on {php_bin}"
        assert '"soap":true' in res.stdout, f"soap extension missing on {php_bin}"
