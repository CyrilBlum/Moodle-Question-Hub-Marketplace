import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitPullRequest } from 'lucide-react';
import { api } from '../api/client';
import { MrStatusBadge } from './ForksAndMergeRequests';

/** Dashboard: open merge requests to review (own packages) and the user's own merge requests. */
export const MyMergeRequests: React.FC = () => {
  const [data, setData] = useState<{ authored: any[]; to_review: any[] } | null>(null);
  useEffect(() => { api.getMyMergeRequests().then(setData).catch(() => setData({ authored: [], to_review: [] })); }, []);
  if (!data || (data.authored.length === 0 && data.to_review.length === 0)) return null;
  const row = (m: any) => (
    <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <Link to={`/packages/${encodeURIComponent(m.target_package_id)}/merge-requests/${m.number}`} className="text-sm font-medium text-slate-900 hover:text-red-700">
          <span className="text-slate-400 mr-1">!{m.number}</span>{m.title}
        </Link>
        <p className="text-xs text-slate-500">{m.target_title} · {m.author.name} · {new Date(m.updated_at).toLocaleDateString('de-CH')}</p>
      </div>
      <MrStatusBadge status={m.status} />
    </li>
  );
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><GitPullRequest className="w-5 h-5 text-red-600" />Merge Requests</h2>
      {data.to_review.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Zu prüfen (Ihre Pakete)</h3>
          <ul className="divide-y divide-slate-100">{data.to_review.map(row)}</ul>
        </div>
      )}
      {data.authored.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Von Ihnen eingereicht</h3>
          <ul className="divide-y divide-slate-100">{data.authored.map(row)}</ul>
        </div>
      )}
    </div>
  );
};
