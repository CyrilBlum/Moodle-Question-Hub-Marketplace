import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, GitMerge, MessageSquare, ThumbsUp } from 'lucide-react';
import { api, getToken } from '../api/client';
import { MrStatusBadge } from '../components/ForksAndMergeRequests';
import { QuestionDiffList, QuestionChange } from '../components/QuestionDiff';
import { LicenseBadge } from '../components/License';
import { plural } from '../utils/plural';

const when = (iso: string) => new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });

export const MergeRequestPage: React.FC = () => {
  const { id = '', number = '' } = useParams<{ id: string; number: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'aenderungen' ? 'changes' : 'overview';
  const [mr, setMr] = useState<any>(null);
  const [changes, setChanges] = useState<any>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState('');
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const loggedIn = !!getToken();

  const load = async () => {
    try {
      const data = await api.getMergeRequest(id, number);
      setMr(data);
      setVersion(v => v || data.mergeability?.next_version || '');
      setError('');
    } catch (err: any) {
      setError(err.status === 403 && !loggedIn ? 'Bitte melden Sie sich an, um diesen Änderungsvorschlag zu sehen.' : err.message || 'Änderungsvorschlag nicht gefunden.');
    }
  };
  const loadChanges = async () => {
    try { setChanges(await api.getMergeRequestChanges(id, number)); } catch (err: any) { setChanges({ available: false, reason: err.message, changes: [] }); }
  };
  useEffect(() => { load(); loadChanges(); }, [id, number]);

  const act = async (fn: () => Promise<any>, success?: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      if (success) setMessage(success);
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Aktion fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-slate-700">{error}</p>
        {!loggedIn && <Link to={`/login?return_to=${encodeURIComponent(window.location.pathname)}`} className="text-red-700 hover:underline text-sm">Anmelden</Link>}
      </div>
    );
  }
  if (!mr) return <div className="max-w-5xl mx-auto px-4 py-12"><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></div>;

  const conflictKeys: string[] = (changes?.changes || []).filter((c: QuestionChange) => c.conflict).map((c: QuestionChange) => c.key);
  const unresolved = conflictKeys.filter(k => !resolutions[k]).length;
  // Comments belong to a question by key; a key that changed since (e.g. a now ambiguous name) falls back to the name.
  const changeKeys = new Set((changes?.changes || []).map((c: QuestionChange) => c.key));
  const questionNotes = mr.notes.filter((n: any) => n.kind === 'comment' && n.question_key).map((n: any) => {
    if (changeKeys.has(n.question_key)) return n;
    const byName = (changes?.changes || []).find((c: QuestionChange) => c.name === n.question_name);
    return byName ? { ...n, question_key: byName.key } : n;
  });
  const p = mr.permissions;
  const m = mr.mergeability;

  const merge = () => act(async () => {
    const res = await api.mergeMergeRequest(id, number, {
      version: version.trim() || undefined, release_notes: releaseNotes.trim() || undefined, resolutions,
      // The versions of the changes shown on this page: the Hub refuses the merge if the fork or the package moved on.
      source_version: changes?.source_version, target_version: changes?.target_version,
    });
    await loadChanges();
    return res;
  }, 'Übernommen. Die neue Version ist veröffentlicht; Moodles mit diesem Paket sehen sie als Update.');

  const setTab = (t: 'overview' | 'changes') => setSearchParams(t === 'changes' ? { tab: 'aenderungen' } : {}, { replace: true });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link to={`/packages/${encodeURIComponent(id)}?tab=merge`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600">
        <ArrowLeft className="w-4 h-4" />Zurück zu «{mr.target.title}»
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
        {editing ? (
          <div className="space-y-2">
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} aria-label="Titel" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-bold" />
            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={6} aria-label="Beschreibung" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Abbrechen</button>
              <button disabled={busy} onClick={() => act(async () => { await api.updateMergeRequest(id, number, { title: editTitle, description: editDescription }); setEditing(false); })}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Speichern</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900"><span className="text-slate-400 font-normal mr-2">!{mr.number}</span>{mr.title}</h1>
              <div className="flex items-center gap-2">
                <MrStatusBadge status={mr.status} />
                {p.can_edit && <button onClick={() => { setEditTitle(mr.title); setEditDescription(mr.description); setEditing(true); }} className="text-xs text-red-700 hover:underline">Bearbeiten</button>}
              </div>
            </div>
            <p className="text-sm text-slate-600">
              <strong>{mr.author.name}</strong> möchte Änderungen aus{' '}
              {mr.source.exists && mr.source.can_access
                ? <Link to={`/packages/${encodeURIComponent(mr.source.id)}`} className="font-mono text-red-700 hover:underline">{mr.source.id}</Link>
                : <span className="font-mono">{mr.source.id}{mr.source.exists ? '' : ' (zurückgezogen)'}</span>}
              {' '}in <span className="font-mono">{mr.target.id}</span> übernehmen · eröffnet {when(mr.created_at)}
              {mr.merged_version && <> · als <strong>Version {mr.merged_version}</strong> übernommen</>}
            </p>
            <div className="text-sm text-slate-800 whitespace-pre-line">{mr.description || <span className="text-slate-400">Keine Beschreibung.</span>}</div>
            <p className="text-xs text-slate-500 flex items-center gap-2">Beiträge stehen unter der Lizenz des Pakets: <LicenseBadge license={mr.target.license} /></p>
          </>
        )}
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex gap-6 overflow-x-auto">
          {[['overview', `Diskussion (${mr.notes.filter((n: any) => n.kind === 'comment').length})`],
            ['changes', `Änderungen${changes?.changes ? ` (${changes.changes.length})` : ''}`]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${tab === t ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {message && <p role="status" className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">{message}</p>}

      {tab === 'overview' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4 min-w-0">
            <h2 className="text-sm font-bold text-slate-900">Aktivität</h2>
            <ol className="space-y-3">
              {mr.notes.map((n: any) => n.kind === 'system' ? (
                <li key={n.id} className="text-xs text-slate-500 pl-3 border-l-2 border-slate-200">
                  <strong className="text-slate-700">{n.author.name}</strong> {n.body} · {when(n.created_at)}
                </li>
              ) : (
                <NoteItem key={n.id} note={n} canResolve={p.can_resolve}
                  onEdit={body => act(() => api.updateMergeRequestNote(id, number, n.id, { body }))}
                  onDelete={() => { if (confirm('Kommentar löschen?')) act(() => api.deleteMergeRequestNote(id, number, n.id)); }}
                  onResolve={resolved => act(() => api.updateMergeRequestNote(id, number, n.id, { resolved }))}
                  onShow={() => { setTab('changes'); setTimeout(() => document.getElementById(`q-${n.question_key}`)?.scrollIntoView({ behavior: 'smooth' }), 300); }} />
              ))}
            </ol>
            {p.can_comment ? (
              <div className="space-y-2">
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} maxLength={10000}
                  placeholder="Kommentar schreiben" aria-label="Kommentar" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="flex justify-end">
                  <button disabled={busy || !comment.trim()} onClick={() => act(async () => { await api.commentMergeRequest(id, number, { body: comment }); setComment(''); })}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50">Kommentieren</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500"><Link to={`/login?return_to=${encodeURIComponent(window.location.pathname)}`} className="text-red-700 hover:underline">Anmelden</Link>, um zu kommentieren.</p>
            )}
          </div>

          <aside className="space-y-4 order-first md:order-none">
            {mr.status === 'open' && m && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-sm">
                <h2 className="font-bold text-slate-900">Übernahme</h2>
                {m.mergeable ? (
                  <div className="text-slate-700 space-y-1">
                    <p>Der Vorschlag ändert {plural(m.changes, 'Frage', 'Fragen')}.</p>
                    {m.conflicts > 0 && (
                      <p className="text-amber-800">
                        Bei {plural(m.conflicts, 'Frage', 'Fragen')} hat auch das Original seither etwas geändert.{' '}
                        <button type="button" onClick={() => setTab('changes')} className="underline font-medium">
                          {p.can_merge ? 'Im Reiter «Änderungen» entscheiden' : 'Im Reiter «Änderungen» ansehen'}
                        </button>
                      </p>
                    )}
                    {!m.base_available && <p className="text-xs text-slate-500">Die Version des Originals, auf der die Variante beruht, wurde zurückgezogen; verglichen wird mit der aktuellen Version.</p>}
                  </div>
                ) : <p className="text-amber-800">{m.reason}</p>}
                {p.can_merge && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <label className="block text-xs font-medium text-slate-600">
                      Neue Versionsnummer des Pakets
                      <input value={version} onChange={e => setVersion(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                      <span className="block mt-0.5 font-normal text-slate-500">Vorschlag: {m.next_version} (aktuell {m.target_version}). Für grössere Änderungen z.B. die mittlere Zahl erhöhen.</span>
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      Versionshinweis (optional)
                      <input value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} placeholder={`Änderungsvorschlag !${mr.number} von ${mr.author.name}: ${mr.title}`}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                    </label>
                    <button disabled={busy || unresolved > 0} onClick={merge}
                      className="w-full inline-flex justify-center items-center gap-1.5 px-3 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">
                      <GitMerge className="w-4 h-4" />{unresolved > 0 ? `Zuerst ${plural(unresolved, 'Konflikt', 'Konflikte')} entscheiden` : `Übernehmen als Version ${version || m.next_version}`}
                    </button>
                    <p className="text-xs text-slate-500">Der Hub veröffentlicht die Änderungen als neue Version; Moodles mit diesem Paket sehen sie als Update.</p>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-sm">
              <h2 className="font-bold text-slate-900">Genehmigungen</h2>
              {mr.approvals.length === 0 ? <p className="text-slate-500 text-xs">Noch keine.</p> : (
                <ul className="text-xs text-slate-700 space-y-1">{mr.approvals.map((a: any) => <li key={a.user_id} className={`flex items-center gap-1 ${a.outdated ? 'text-slate-400' : ''}`}><Check className={`w-3.5 h-3.5 ${a.outdated ? 'text-slate-300' : 'text-emerald-600'}`} />{a.name}{a.outdated && ` (für Varianten-Version ${a.source_version}, inzwischen geändert)`}</li>)}</ul>
              )}
              {p.can_approve && (
                <button disabled={busy} onClick={() => act(() => api.setMergeRequestApproval(id, number, !p.approved_by_me))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs hover:bg-slate-50">
                  <ThumbsUp className="w-3.5 h-3.5" />{p.approved_by_me ? 'Genehmigung zurücknehmen' : 'Genehmigen'}
                </button>
              )}
            </div>
            {(p.can_close || p.can_reopen) && (
              <button disabled={busy} onClick={() => {
                if (p.can_close && !confirm('Änderungsvorschlag schliessen, ohne ihn zu übernehmen? Er kann später wieder geöffnet werden.')) return;
                act(() => api.updateMergeRequest(id, number, { status: p.can_close ? 'closed' : 'open' }));
              }}
                className="text-sm text-slate-600 underline hover:text-red-700">
                {p.can_close ? 'Ohne Übernahme schliessen' : 'Wieder öffnen'}
              </button>
            )}
          </aside>
        </div>
      )}

      {tab === 'changes' && (
        <div className="space-y-3">
          {!changes ? <p className="text-sm text-slate-500">Lade Änderungen …</p> : !changes.available ? (
            <p className="text-sm text-slate-600">{changes.reason}</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Was die Variante gegenüber dem Original (Version {changes.base_version}) geändert hat: rot entfernt, grün neu.
                {!changes.base_available && ' Diese Version des Originals wurde zurückgezogen; verglichen wird mit der aktuellen Version.'}
              </p>
              <QuestionDiffList changes={changes.changes} sideLabel="Änderung in der Variante" otherLabel="Änderung im Original"
                resolutions={resolutions}
                resolveOptions={p.can_merge ? [{ value: 'target', label: 'Frage wie im Original' }, { value: 'source', label: 'Frage wie in der Variante' }] : undefined}
                onResolve={p.can_merge ? (k, v) => setResolutions(r => ({ ...r, [k]: v })) : undefined}
                notes={questionNotes}
                onComment={p.can_comment ? async (c, body) => { await api.commentMergeRequest(id, number, { body, question_key: c.key, question_name: c.name }); await load(); } : undefined} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

const NoteItem: React.FC<{
  note: any; canResolve: boolean;
  onEdit: (body: string) => void; onDelete: () => void; onResolve: (r: boolean) => void; onShow: () => void;
}> = ({ note, canResolve, onEdit, onDelete, onResolve, onShow }) => {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  return (
    <li className={`rounded-lg border p-3 ${note.resolved ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span><strong className="text-slate-800">{note.author.name}</strong> · {when(note.created_at)}{note.updated_at !== note.created_at && ' · bearbeitet'}</span>
        <span className="flex gap-3">
          {note.question_key && <button onClick={onShow} className="inline-flex items-center gap-1 text-red-700 hover:underline"><MessageSquare className="w-3 h-3" />zu «{note.question_name}»</button>}
          {note.question_key && canResolve && <button onClick={() => onResolve(!note.resolved)} className="hover:underline">{note.resolved ? 'Wieder öffnen' : 'Erledigt'}</button>}
          {note.can_edit && !editing && <button onClick={() => setEditing(true)} className="hover:underline">Bearbeiten</button>}
          {note.can_delete && <button onClick={onDelete} className="hover:underline text-rose-700">Löschen</button>}
        </span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} aria-label="Kommentar bearbeiten" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 rounded border border-slate-300">Abbrechen</button>
            <button onClick={() => { onEdit(body); setEditing(false); }} className="text-xs px-2 py-1 rounded bg-slate-900 text-white">Speichern</button>
          </div>
        </div>
      ) : <p className={`mt-1 text-sm whitespace-pre-line ${note.resolved ? 'text-slate-500' : 'text-slate-800'}`}>{note.body}</p>}
    </li>
  );
};
