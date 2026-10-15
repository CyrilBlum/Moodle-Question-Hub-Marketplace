import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Trash2, Archive, Search, AlertCircle } from 'lucide-react';
import { api, getToken } from '../api/client';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('de-CH');

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<{ users: any[]; withdrawn: any[] } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      setData(await api.getAdminOverview());
      setError('');
    } catch (err: any) {
      setError(err.status === 403 ? 'Dieser Bereich ist nur für Administratorinnen und Administratoren.' : err.message);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      navigate('/login');
      return;
    }
    load();
  }, []);

  const withdraw = async (pkg: any) => {
    if (!window.confirm(`Paket «${pkg.title}» (${pkg.id}) zurückziehen? Es verschwindet aus dem Katalog; die ID bleibt gesperrt, bis Sie es endgültig löschen.`)) return;
    setBusy(pkg.id);
    try {
      await api.withdrawPackage(pkg.id);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const purge = async (item: any) => {
    if (!window.confirm(`Zurückgezogenes Paket ${item.id} endgültig löschen? Die ID wird wieder frei, und Moodles, die es importiert haben, erhalten «nicht gefunden» statt «zurückgezogen». Dies kann nicht rückgängig gemacht werden.`)) return;
    setBusy(item.id);
    try {
      await api.purgeWithdrawnPackage(item.id);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const q = query.trim().toLowerCase();
  const users = useMemo(() => (data?.users || []).filter(u => !q
    || [u.email, u.full_name, u.institution].some((v: string) => (v || '').toLowerCase().includes(q))
    || u.packages.some((p: any) => p.id.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
    || u.withdrawn.some((w: any) => w.id.toLowerCase().includes(q))), [data, q]);
  const packageCount = (data?.users || []).reduce((sum, u) => sum + u.packages.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Shield className="w-7 h-7 text-red-600" />
        <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[['Benutzerkonten', data.users.length], ['Aktive Pakete', packageCount], ['Zurückgezogene Pakete', data.withdrawn.length]].map(([label, value]) => (
              <div key={label as string} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-sm text-slate-500">{label}</div>
                <div className="text-2xl font-bold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Benutzerkonten und ihre Pakete</h2>
              <label className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="E-Mail, Name oder Paket suchen"
                       className="border rounded-md pl-8 pr-3 py-1.5 text-sm w-72 max-w-full" />
              </label>
            </div>
            <ul className="divide-y divide-slate-100">
              {users.map(u => (
                <li key={u.id} className="p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-slate-900">{u.full_name}</span>
                    <span className="text-sm text-slate-600">{u.email}</span>
                    {u.role === 'admin' && <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">Admin</span>}
                    <span className="text-xs text-slate-500">{u.institution} · {u.canton} · seit {formatDate(u.created_at)}</span>
                  </div>
                  {u.packages.length === 0 && u.withdrawn.length === 0 && (
                    <p className="text-sm text-slate-400 mt-1">Keine Pakete.</p>
                  )}
                  {u.packages.length > 0 && (
                    <table className="w-full text-sm mt-2">
                      <tbody>
                        {u.packages.map((p: any) => (
                          <tr key={p.id} className="border-t border-slate-100">
                            <td className="py-1.5 pr-3">
                              <Link to={`/packages/${encodeURIComponent(p.id)}`} className="text-slate-900 hover:text-red-600">{p.title}</Link>
                              <div className="text-xs text-slate-500 font-mono">{p.id}</div>
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">v{p.latest_version}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">
                              {p.release_count} Version(en){p.withdrawn_release_count > 0 && `, ${p.withdrawn_release_count} zurückgezogen`}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{p.visibility === 'private' ? 'privat' : 'öffentlich'}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{p.downloads_count} Downloads</td>
                            <td className="py-1.5 text-right">
                              <button onClick={() => withdraw(p)} disabled={busy === p.id}
                                      className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded px-2 py-1 hover:border-red-400 hover:text-red-700 disabled:opacity-50">
                                <Archive className="w-3.5 h-3.5" />Zurückziehen
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {u.withdrawn.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                      Zurückgezogen: {u.withdrawn.map((w: any) => `${w.id} (v${w.last_version})`).join(', ')}
                    </p>
                  )}
                </li>
              ))}
              {users.length === 0 && <li className="p-4 text-sm text-slate-500">Keine Treffer.</li>}
            </ul>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Zurückgezogene Pakete</h2>
              <p className="text-sm text-slate-600 mt-1">
                Inhalte und Dateien sind bereits gelöscht. Erhalten bleibt nur der Eintrag, der die Paket-ID sperrt und Moodles
                «zurückgezogen» meldet. Endgültiges Löschen gibt die ID wieder frei.
              </p>
            </div>
            {data.withdrawn.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Keine zurückgezogenen Pakete.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr><th className="p-3 font-medium">Paket-ID</th><th className="p-3 font-medium">Letzte Version</th><th className="p-3 font-medium">Besitzer/in</th><th className="p-3 font-medium">Zurückgezogen</th><th className="p-3" /></tr>
                </thead>
                <tbody>
                  {data.withdrawn.map(w => (
                    <tr key={w.id} className="border-t border-slate-100">
                      <td className="p-3 font-mono text-xs">{w.id}</td>
                      <td className="p-3">v{w.last_version}</td>
                      <td className="p-3">{w.owner_email || <span className="text-slate-400">gelöschtes Konto</span>}</td>
                      <td className="p-3">{formatDate(w.withdrawn_at)}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => purge(w)} disabled={busy === w.id}
                                className="inline-flex items-center gap-1 text-xs bg-red-600 text-white rounded px-2 py-1 hover:bg-red-700 disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />Endgültig löschen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
};
