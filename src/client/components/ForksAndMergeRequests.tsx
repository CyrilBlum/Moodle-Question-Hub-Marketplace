import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitFork, GitPullRequest, GitMerge, XCircle, MessageSquare } from 'lucide-react';
import { api } from '../api/client';

export const MR_STATUS: Record<string, { label: string; cls: string; icon: React.FC<any> }> = {
  open: { label: 'Offen', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: GitPullRequest },
  merged: { label: 'Übernommen', cls: 'bg-violet-50 text-violet-800 border-violet-200', icon: GitMerge },
  closed: { label: 'Geschlossen', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: XCircle },
};

export const MrStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = MR_STATUS[status] || MR_STATUS.closed;
  const Icon = s.icon;
  return <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${s.cls}`}><Icon className="w-3.5 h-3.5" />{s.label}</span>;
};

/** Forks of a package the viewer can see. */
export const ForksList: React.FC<{ pkg: any }> = ({ pkg }) => {
  const [forks, setForks] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.getForks(pkg.id).then(r => setForks(r.data || [])).catch(e => setError(e.message || 'Forks nicht verfügbar.'));
  }, [pkg.id]);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><GitFork className="w-4 h-4" />Forks</h2>
      <p className="text-xs text-slate-500">Kopien dieses Pakets, die andere Lehrpersonen weiterentwickeln. Verbesserungen kommen über Änderungsvorschläge zurück.</p>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {forks && forks.length === 0 && <p className="text-sm text-slate-500">Noch keine Forks.</p>}
      <ul className="divide-y divide-slate-100">
        {forks?.map(f => (
          <li key={f.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link to={`/packages/${encodeURIComponent(f.id)}`} className="font-medium text-slate-900 hover:text-red-700">{f.title}</Link>
              <p className="text-xs text-slate-500">
                {f.author.name}{f.author.institution ? ` · ${f.author.institution}` : ''} · v{f.latest_version} · basiert auf v{f.forked_from_version}
                {f.visibility === 'private' ? ' · privat' : ''}
              </p>
            </div>
            {f.open_merge_request && (
              <Link to={`/packages/${encodeURIComponent(pkg.id)}/merge-requests/${f.open_merge_request}`} className="text-xs text-red-700 hover:underline">
                Änderungsvorschlag !{f.open_merge_request}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Merge requests into a package, filterable by status. */
export const MergeRequestList: React.FC<{ pkg: any }> = ({ pkg }) => {
  const [status, setStatus] = useState<'open' | 'merged' | 'closed' | 'all'>('open');
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setItems(null);
    api.getMergeRequests(pkg.id, status).then(r => setItems(r.data || [])).catch(e => setError(e.message || 'Änderungsvorschläge nicht verfügbar.'));
  }, [pkg.id, status]);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><GitPullRequest className="w-4 h-4" />Änderungsvorschläge</h2>
        <div className="flex gap-1 text-xs" role="tablist">
          {(['open', 'merged', 'closed', 'all'] as const).map(s => (
            <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-full border ${status === s ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {s === 'all' ? 'Alle' : MR_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Vorschläge aus Forks dieses Pakets. Die Admins des Pakets prüfen sie Frage für Frage und übernehmen sie als neue Version.
        Einen eigenen Vorschlag machen Sie, indem Sie das Paket forken, den Fork ändern und dort «Änderungsvorschlag erstellen» wählen.
      </p>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {items === null && !error && <p className="text-sm text-slate-500">Lade …</p>}
      {items && items.length === 0 && <p className="text-sm text-slate-500">Keine Änderungsvorschläge.</p>}
      <ul className="divide-y divide-slate-100">
        {items?.map(m => (
          <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/packages/${encodeURIComponent(pkg.id)}/merge-requests/${m.number}`} className="font-medium text-slate-900 hover:text-red-700">
                <span className="text-slate-400 mr-1">!{m.number}</span>{m.title}
              </Link>
              <p className="text-xs text-slate-500">
                {m.author.name} · aus <span className="font-mono">{m.source_package_id}</span> · {new Date(m.created_at).toLocaleDateString('de-CH')}
                {m.merged_version ? ` · als v${m.merged_version} übernommen` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {m.comments_count > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><MessageSquare className="w-3.5 h-3.5" />{m.comments_count}</span>}
              <MrStatusBadge status={m.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
