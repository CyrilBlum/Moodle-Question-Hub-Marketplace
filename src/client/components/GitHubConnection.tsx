import React, { useEffect, useState } from 'react';
import { Github, AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client';

/** Optional GitHub connection of the own account: stores a token so packages can be mirrored to a repository. */
export const GitHubConnection: React.FC = () => {
  const [connection, setConnection] = useState<{ connected: boolean; login: string | null; connected_at: string | null } | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api.getGitHubConnection().then(setConnection).catch(() => setConnection(null));
  useEffect(() => { load(); }, []);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.connectGitHub(token.trim());
      setToken('');
      setMessage({ ok: true, text: `Verbunden als ${res.login}.` });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Verbinden fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.testGitHub();
      if (res.ok) {
        const expiry = res.expires_at ? ` Der Token läuft am ${new Date(res.expires_at).toLocaleDateString('de-CH')} ab.` : '';
        setMessage({ ok: true, text: `Verbindung funktioniert: GitHub erkennt den Token als ${res.login}.${expiry}` });
      } else {
        setMessage({ ok: false, text: `${res.message} Lösen Sie die Verbindung und hinterlegen Sie einen neuen Token.` });
      }
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Test fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('GitHub-Verbindung lösen? Pakete, die Sie mit GitHub verknüpft haben, werden danach nicht mehr committet.')) return;
    try {
      await api.disconnectGitHub();
      setMessage({ ok: true, text: 'GitHub-Verbindung gelöst. Der Token ist im Hub gelöscht.' });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Trennen fehlgeschlagen.' });
    }
  };

  return (
    <div id="github" className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-20">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
          <Github className="w-5 h-5 text-red-600" />
          <span>GitHub-Verbindung (optional)</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Freiwillig und für den Hub nicht nötig. Mit einer Verbindung können Sie ein Paket mit einem GitHub-Repository
          verknüpfen: Jede neue Version wird dann dort committet, mit den Versionshinweisen als Commit-Nachricht.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 border ${
          message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {connection?.connected ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-700">
            Verbunden als <span className="font-mono font-semibold">{connection.login}</span>
            {connection.connected_at && <> seit {new Date(connection.connected_at).toLocaleDateString('de-CH')}</>}.
          </p>
          <div className="flex gap-2">
            <button onClick={test} disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy ? 'Teste…' : 'Verbindung testen'}
            </button>
            <button onClick={disconnect} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
              Verbindung lösen
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            GitHub-Token
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="github_pat_…"
              className="mt-1 w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-slate-50 font-mono focus:bg-white"
            />
          </label>
          <p className="text-xs text-slate-500">
            Erstellen Sie auf GitHub unter Settings › Developer settings › Fine-grained tokens einen Token mit der
            Berechtigung «Contents: Read and write». Soll der Hub neue Repositorys selbst anlegen, wählen Sie «All repositories»
            und zusätzlich «Administration: Read and write»; sonst genügen die ausgewählten, bereits bestehenden Repositorys.
            Der Hub speichert den Token verschlüsselt, zeigt ihn nie wieder an und nutzt ihn nur, um verknüpfte Repositorys
            anzulegen und dorthin zu committen.
          </p>
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Prüfe Token…' : 'Mit GitHub verbinden'}
          </button>
        </form>
      )}
    </div>
  );
};
