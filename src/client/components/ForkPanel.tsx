import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GitFork, GitPullRequest, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { QuestionDiffList } from './QuestionDiff';
import { plural } from '../utils/plural';

/**
 * Status of a fork against its original for its editors: ahead/behind, "sync with the original"
 * (with conflict resolution) and "create merge request".
 */
export const ForkPanel: React.FC<{ pkg: any; onChanged: () => void }> = ({ pkg, onChanged }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'none' | 'sync' | 'mr'>('none');
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [mrTitle, setMrTitle] = useState('');
  const [mrDescription, setMrDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [openMr, setOpenMr] = useState<number | null>(null);
  // "Sync" moves the fork onto the original; also used to label the button.
  const origin = pkg.forked_from;

  const load = async (details = false) => {
    setError('');
    try {
      setStatus(await api.getForkStatus(pkg.id, details));
    } catch (err: any) {
      setError(err.message || 'Der Stand gegenüber dem Original ist nicht verfügbar.');
    }
    if (origin?.exists) {
      try {
        const list = await api.getMergeRequests(origin.id, 'open');
        setOpenMr((list.data || []).find((m: any) => m.source_package_id === pkg.id)?.number ?? null);
      } catch { /* no access */ }
    }
  };

  useEffect(() => { load(); }, [pkg.id, pkg.latest_version]);

  if (!origin) return null;
  if (!origin.exists) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <GitFork className="inline w-4 h-4 mr-1" />Das ursprüngliche Paket <code>{origin.id}</code> wurde zurückgezogen. Der Fork bleibt als eigenständiges Paket bestehen.
      </div>
    );
  }

  const sync = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.syncFork(pkg.id, { resolutions, release_notes: notes || undefined });
      setMessage(res.status === 'merged' ? `Abgeglichen: Version ${res.version} des Forks enthält jetzt die Änderungen des Originals bis v${res.base_version}.`
        : res.status === 'base_moved' ? `Der Fork ist auf dem Stand von v${res.base_version}; eine neue Version war nicht nötig.`
          : 'Der Fork ist bereits auf dem neuesten Stand.');
      setMode('none');
      setResolutions({});
      onChanged();
      load();
    } catch (err: any) {
      setMessage(err.message || 'Abgleich fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const createMr = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const res = await api.createMergeRequest(origin.id, { source_package_id: pkg.id, title: mrTitle.trim(), description: mrDescription.trim() || undefined, accept_license: true });
      navigate(`/packages/${encodeURIComponent(origin.id)}/merge-requests/${res.number}`);
    } catch (err: any) {
      setMessage(err.message || 'Der Änderungsvorschlag konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  };

  const conflicts = (status?.incoming || []).filter((c: any) => c.conflict);
  const unresolved = conflicts.filter((c: any) => !resolutions[c.key]).length;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><GitFork className="w-4 h-4" />Fork von «{origin.title}»</h2>
        <Link to={`/packages/${encodeURIComponent(origin.id)}`} className="text-xs text-red-700 hover:underline">Zum Original</Link>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {status && (
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            {status.ahead === 0 ? 'Sie haben im Fork noch nichts geändert.' : `Sie haben im Fork ${plural(status.ahead, 'Frage', 'Fragen')} geändert, hinzugefügt oder entfernt.`}{' '}
            {status.behind === 0
              ? 'Das Original hat sich seit Ihrer Kopie nicht verändert.'
              : `Das Original hat sich seit Ihrer Kopie (Version ${status.base_version}) verändert: ${plural(status.behind, 'Frage', 'Fragen')}, aktuell Version ${status.upstream.latest_version}.`}
          </p>
          {status.conflicts > 0 && (
            <p className="text-amber-800">Bei {plural(status.conflicts, 'Frage', 'Fragen')} haben beide Seiten etwas geändert: Beim Übernehmen entscheiden Sie, welche Fassung gilt.</p>
          )}
          {!status.base_available && <p className="text-xs text-slate-500">Die Version, auf der Ihr Fork beruht, wurde zurückgezogen; verglichen wird mit der aktuellen Version des Originals.</p>}
        </div>
      )}
      {status?.can_sync && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={status.behind === 0 && status.base_version === status.upstream.latest_version}
            onClick={() => { setMode('sync'); load(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className="w-4 h-4" />Änderungen des Originals übernehmen{status.conflicts > 0 ? ` (${plural(status.conflicts, 'Konflikt', 'Konflikte')})` : ''}
          </button>
          {openMr ? (
            <Link to={`/packages/${encodeURIComponent(origin.id)}/merge-requests/${openMr}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">
              <GitPullRequest className="w-4 h-4" />Offener Änderungsvorschlag !{openMr}
            </Link>
          ) : (
            <button type="button" disabled={status.ahead === 0} onClick={() => setMode('mr')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
              title={status.ahead === 0 ? 'Der Fork enthält noch keine Änderungen.' : undefined}>
              <GitPullRequest className="w-4 h-4" />Änderungsvorschlag erstellen
            </button>
          )}
        </div>
      )}
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}

      {mode === 'sync' && status && (
        <div className="space-y-3 rounded-lg bg-white border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Änderungen im Original seit Version {status.base_version}</h3>
          <p className="text-xs text-slate-600">
            Es entsteht Version {status.next_version} Ihres Forks mit diesen Änderungen; Ihre eigenen Änderungen bleiben erhalten,
            das Original bleibt unverändert. Danach holen Sie die neue Version in Moodle mit «Pull».
          </p>
          {status.incoming ? (
            <QuestionDiffList changes={status.incoming} sideLabel="Änderung im Original" otherLabel="Ihre Änderung im Fork"
              resolutions={resolutions}
              resolveOptions={[{ value: 'upstream', label: 'Fassung des Originals behalten' }, { value: 'fork', label: 'Fassung des Forks behalten' }]}
              onResolve={(k, v) => setResolutions(r => ({ ...r, [k]: v }))} />
          ) : <p className="text-sm text-slate-500">Lade Änderungen …</p>}
          <label className="block text-sm text-slate-700">
            Versionshinweis (optional)
            <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder={`Abgleich mit ${origin.id} v${status.upstream.latest_version}`} />
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setMode('none')} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Abbrechen</button>
            <button type="button" onClick={sync} disabled={busy || unresolved > 0}
              className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
              {unresolved > 0 ? `${plural(unresolved, 'Konflikt', 'Konflikte')} offen` : busy ? 'Wird übernommen …' : `Als Version ${status.next_version} übernehmen`}
            </button>
          </div>
        </div>
      )}

      {mode === 'mr' && (
        <form onSubmit={createMr} className="space-y-3 rounded-lg bg-white border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Änderungsvorschlag an «{origin.title}»</h3>
          <label className="block text-sm text-slate-700">
            Titel
            <input value={mrTitle} onChange={e => setMrTitle(e.target.value)} required minLength={3} maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="z.B. Fehler in K2-Fragen korrigiert" />
          </label>
          <label className="block text-sm text-slate-700">
            Beschreibung
            <textarea value={mrDescription} onChange={e => setMrDescription(e.target.value)} rows={5} maxLength={20000}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Was haben Sie geändert und warum?" />
          </label>
          <p className="text-xs text-slate-500">
            Die Admins des Originals erhalten eine E-Mail und können die Änderungen Frage für Frage prüfen, kommentieren und übernehmen.
            Neue Versionen Ihres Forks erscheinen automatisch im offenen Änderungsvorschlag.
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" required className="mt-1" />
            <span>Ich stelle meine Änderungen unter die Lizenz des Originals ({status?.upstream?.license || origin.license || 'siehe Original'}).</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setMode('none')} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Abbrechen</button>
            <button type="submit" disabled={busy} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
              Änderungsvorschlag erstellen
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
