"""
Feature 16: Captcha, package roles, older versions.
Verifies the proof-of-work captcha on login, package members (member, editor, admin) with their rights,
downloading every published version, and restoring an older version into a linked Moodle category
(the import path of the plugin's "Restore an older version" form) on both Moodle versions.
"""

import base64
import hashlib
import json
import time

import pytest
import requests

from conftest import HubClient, MOODLE_INSTANCES, run_hetzner_ssh


def _xml(ts: int, version: int) -> str:
    """Package with question A (text changes per version) and, from version 2 on, question B."""
    second = f"""
  <question type="truefalse">
    <name><text>E2E Restore B {ts}</text></name>
    <questiontext format="html"><text><![CDATA[<p>Nur ab Version 2.</p>]]></text></questiontext>
    <answer fraction="100"><text>true</text></answer>
    <answer fraction="0"><text>false</text></answer>
  </question>""" if version >= 2 else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category><text>$course$/top/E2E_Restore_{ts}</text></category>
  </question>
  <question type="truefalse">
    <name><text>E2E Restore A {ts}</text></name>
    <questiontext format="html"><text><![CDATA[<p>Fassung {version}</p>]]></text></questiontext>
    <answer fraction="100"><text>true</text></answer>
    <answer fraction="0"><text>false</text></answer>
  </question>{second}
</quiz>"""


def _metadata(pkg_id: str, version: str, **extra) -> dict:
    return {
        "id": pkg_id, "version": version, "title": f"E2E Rollen {pkg_id[-13:]}", "summary": "Rollen- und Versionstest",
        "language": "de-CH", "taxonomy": {"subject": "Informatik", "level": "GF", "canton": "ZH"}, **extra,
    }


def _register(hub_url: str, name: str) -> HubClient:
    client = HubClient(hub_url)
    ts = int(time.time() * 1000)
    resp = client.session.post(f"{client.api_base}/auth/register", json={
        "email": f"e2e_{name}_{ts}@kanti.ch", "password": "E2E-Roles-Pass-123!", "full_name": f"E2E {name} {ts}",
        "institution": "Kantonsschule E2E", "canton": "ZH", "altcha": client.captcha(),
    }, timeout=15)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    client.set_token(data["token"])
    client.user = data["user"]
    return client


def _delete_accounts(admin: HubClient, *clients: HubClient) -> None:
    """Throw-away accounts are deleted through the admin API (the test teacher is a Hub admin)."""
    for client in clients:
        admin.session.delete(f"{admin.api_base}/admin/users/{client.user['id']}", headers=admin._headers(), timeout=15)


def test_f16_t01_login_requires_a_fresh_captcha(hub_client):
    """Login without captcha is refused; a solved captcha works once (wrong password -> 401), not twice."""
    url = f"{hub_client.api_base}/auth/login"
    credentials = {"email": "e2e-nobody@example.invalid", "password": "wrong-password"}
    missing = requests.post(url, json=credentials, timeout=15)
    assert missing.status_code == 400
    assert missing.json().get("code") == "CAPTCHA_FAILED"
    solved = hub_client.captcha()
    assert requests.post(url, json={**credentials, "altcha": solved}, timeout=15).status_code == 401
    replay = requests.post(url, json={**credentials, "altcha": solved}, timeout=15)
    assert replay.status_code == 400 and replay.json().get("code") == "CAPTCHA_FAILED"


def test_f16_t02_package_roles(hub_client, teacher_jwt, hub_url):
    """Members read a private package, editors publish versions, admins manage it; the creator stays admin."""
    hub_client.set_token(teacher_jwt)
    pkg_id = f"ch.gym.zh.roles.{int(time.time() * 1000)}"
    assert hub_client.publish_package(_metadata(pkg_id, "1.0.0", visibility="private"), _xml(1, 1)).status_code == 201
    editor = _register(hub_url, "editor")
    reader = _register(hub_url, "reader")
    members_url = f"{hub_client.api_base}/packages/{pkg_id}/members"

    def detail(client: HubClient) -> dict:
        return client.session.get(f"{client.api_base}/packages/{pkg_id}", headers=client._headers(), timeout=15).json()

    try:
        assert detail(reader)["can_access"] is False
        assert editor.publish_package(_metadata(pkg_id, "1.1.0"), _xml(1, 2)).status_code == 403
        for client, role in ((editor, "editor"), (reader, "member")):
            r = hub_client.session.post(members_url, json={"email": client.user["email"], "role": role},
                                        headers=hub_client._headers(), timeout=15)
            assert r.status_code == 201, r.text

        listing = reader.session.get(members_url, headers=reader._headers(), timeout=15).json()
        assert [m["role"] for m in listing["members"]] == ["admin", "editor", "member"]
        assert all(m["email"] is None for m in listing["members"]), "Only package admins see e-mail addresses"
        assert detail(reader)["can_access"] is True
        assert reader.publish_package(_metadata(pkg_id, "1.1.0"), _xml(1, 2)).status_code == 403

        # Editors add versions without touching the settings, and cannot manage the package.
        published = editor.publish_package(_metadata(pkg_id, "1.1.0", title="Vom Editor", visibility="public"), _xml(1, 2))
        assert published.status_code == 201, published.text
        seen = detail(editor)
        assert seen["latest_version"] == "1.1.0" and seen["visibility"] == "private" and seen["my_role"] == "editor"
        patch = editor.session.patch(f"{editor.api_base}/packages/{pkg_id}", json={"title": "Neuer Titel"},
                                     headers=editor._headers(), timeout=15)
        assert patch.status_code == 403
        mine = editor.session.get(f"{editor.api_base}/account/packages", headers=editor._headers(), timeout=15).json()["data"]
        assert any(p["id"] == pkg_id and p["my_role"] == "editor" for p in mine)

        # Promoted to admin: may edit settings; removing the reader revokes access.
        promote = hub_client.session.patch(f"{members_url}/{editor.user['id']}", json={"role": "admin"},
                                           headers=hub_client._headers(), timeout=15)
        assert promote.status_code == 204
        patch = editor.session.patch(f"{editor.api_base}/packages/{pkg_id}", json={"title": "E2E Rollen geaendert"},
                                     headers=editor._headers(), timeout=15)
        assert patch.status_code == 200
        removed = editor.session.delete(f"{members_url}/{reader.user['id']}", headers=editor._headers(), timeout=15)
        assert removed.status_code == 204
        assert detail(reader)["can_access"] is False
    finally:
        hub_client.session.delete(f"{hub_client.api_base}/packages/{pkg_id}", headers=hub_client._headers(), timeout=15)
        _delete_accounts(hub_client, editor, reader)


def test_f16_t03_every_version_downloadable(hub_client, teacher_jwt):
    """Each release stays downloadable with its own content (download menu on the package page)."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.versions.{ts}"
    for number, version in ((1, "1.0.0"), (2, "1.1.0")):
        assert hub_client.publish_package(_metadata(pkg_id, version), _xml(ts, number)).status_code == 201
    releases = hub_client.get_package(pkg_id).json()["releases"]
    assert {r["version"] for r in releases} == {"1.0.0", "1.1.0"}
    for number, version in ((1, "1.0.0"), (2, "1.1.0")):
        resp = hub_client.download_release(pkg_id, version)
        assert resp.status_code == 200
        assert hashlib.sha256(resp.content).hexdigest() == hashlib.sha256(_xml(ts, number).encode()).hexdigest()


_IMPORT_PHP = r"""
define('CLI_SCRIPT', true);
require_once('__ROOT__/config.php');
require_once($CFG->libdir . '/questionlib.php');
\core\session\manager::set_user(get_admin());
$meta = json_decode(base64_decode('__META__'), true);
$xml = base64_decode('__XML__');
$target = __TARGET__;
// Same arguments as the plugin's pull and restore forms: linked category, keep, update changed questions.
$importer = new \qbank_questionhub\package_importer(2, $target ?: null);
$importer->import_package($xml, true, $meta, $target ? 'keep' : null, (bool)$target);
$history = $DB->get_records('qbank_questionhub_history', ['package_id' => $meta['id'], 'action' => 'import'], 'id DESC', '*', 0, 1);
$history = reset($history);
$texts = [];
$like = $DB->sql_like('q.name', ':name');
$rows = $DB->get_records_sql("SELECT q.id, q.name, q.questiontext FROM {question} q
    JOIN {question_versions} qv ON qv.questionid = q.id
   WHERE $like AND qv.version = (SELECT MAX(v2.version) FROM {question_versions} v2
                                  WHERE v2.questionbankentryid = qv.questionbankentryid)",
    ['name' => 'E2E Restore % __TS__']);
foreach ($rows as $row) {
    $texts[$row->name] = strip_tags($row->questiontext);
}
echo json_encode(['categoryid' => (int)$history->categoryid, 'version' => $history->package_version, 'texts' => $texts]);
"""


@pytest.mark.parametrize("instance", ["m1", "m2"])
def test_f16_t04_restore_older_version_in_moodle(hub_client, teacher_jwt, instance):
    """Import 1.0.0, pull 1.1.0, restore 1.0.0: changed text goes back, the later question stays."""
    hub_client.set_token(teacher_jwt)
    ts = int(time.time() * 1000)
    pkg_id = f"ch.gym.zh.restore.{instance}.{ts}"
    for number, version in ((1, "1.0.0"), (2, "1.1.0")):
        assert hub_client.publish_package(_metadata(pkg_id, version), _xml(ts, number)).status_code == 201
    moodle = MOODLE_INSTANCES[instance]

    def import_version(version: str, target: int) -> dict:
        xml = hub_client.download_release(pkg_id, version).text
        code = (_IMPORT_PHP.replace("__ROOT__", moodle["root"]).replace("__TS__", str(ts))
                .replace("__META__", base64.b64encode(json.dumps(_metadata(pkg_id, version)).encode()).decode())
                .replace("__XML__", base64.b64encode(xml.encode()).decode())
                .replace("__TARGET__", str(target)))
        b64 = base64.b64encode(code.strip().encode()).decode()
        res = run_hetzner_ssh(f"sudo -u www-data {moodle['php']} -r 'eval(base64_decode(\"{b64}\"));'", timeout=120)
        out = res.stdout.strip()
        assert res.returncode == 0 and "{" in out, f"{moodle['label']}: {res.stderr}\n{out}"
        return json.loads(out[out.find("{"):])

    first = import_version("1.0.0", 0)
    assert first["version"] == "1.0.0"
    assert first["texts"] == {f"E2E Restore A {ts}": "Fassung 1"}
    linked = first["categoryid"]

    pulled = import_version("1.1.0", linked)
    assert pulled["version"] == "1.1.0" and pulled["categoryid"] == linked
    assert pulled["texts"] == {f"E2E Restore A {ts}": "Fassung 2", f"E2E Restore B {ts}": "Nur ab Version 2."}

    restored = import_version("1.0.0", linked)
    assert restored["version"] == "1.0.0" and restored["categoryid"] == linked
    assert restored["texts"][f"E2E Restore A {ts}"] == "Fassung 1"
    assert f"E2E Restore B {ts}" in restored["texts"], "Questions added later stay after a restore"
