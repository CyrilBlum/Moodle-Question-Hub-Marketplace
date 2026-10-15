import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Trash2, Archive, Search, AlertCircle, Mail, UserX, Check, UserPlus } from 'lucide-react';
import { api, getToken, getStoredUser } from '../api/client';
import { CANTONS } from './DashboardPage';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('de-CH');

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<{ users: any[]; withdrawn: any[]; email_enabled: boolean } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [composeFor, setComposeFor] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const currentUserId = getStoredUser()?.id;
  const emptyAccount = { email: '', full_name: '', institution: '', canton: '', role: 'teacher', password: '' };
  const [creating, setCreating] = useState(false);
  const [account, setAccount] = useState<Record<string, string>>(emptyAccount);
  const [initialPassword, setInitialPassword] = useState<{ email: string; password: string } | null>(null);
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

  const deleteUser = async (u: any) => {
    if (!window.confirm(`Konto ${u.full_name} (${u.email}) endgültig löschen? Zugangstokens und Zugriffsanfragen werden mitgelöscht. Dies kann nicht rückgängig gemacht werden.`)) return;
    setBusy(u.id);
    try {
      await api.deleteUser(u.id);
      setNotice(`Konto ${u.email} wurde gelöscht.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const sendEmail = async (event: React.FormEvent, u: any) => {
    event.preventDefault();
    setBusy(u.id);
    try {
      await api.emailUser(u.id, subject, message);
      setNotice(`E-Mail an ${u.email} wurde versendet.`);
      setComposeFor('');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('create');
    setError('');
    try {
      const res = await api.createUser(account);
      setNotice(`Konto ${res.user.email} wurde erstellt.`);
      setInitialPassword(res.initial_password ? { email: res.user.email, password: res.initial_password } : null);
      setAccount(emptyAccount);
      setCreating(false);
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

      {notice && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
          <Check className="w-5 h-5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {initialPassword && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm space-y-1">
          <div>Startpasswort für {initialPassword.email} (nur jetzt sichtbar, bitte sicher weitergeben):</div>
          <code className="block font-mono text-base select-all bg-white border border-amber-200 rounded px-2 py-1 w-fit">{initialPassword.password}</code>
          <div className="text-xs">Die Person kann das Passwort nach der Anmeldung im Dashboard ändern.</div>
          <button onClick={() => setInitialPassword(null)} className="text-xs underline">Ausblenden</button>
        </div>
      )}

      {data && (
        <>
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Benutzerkonten und ihre Pakete</h2>
                <p className="text-xs text-slate-500">
                  {data.users.length} Benutzerkonten · {packageCount} aktive Pakete · {data.withdrawn.length} zurückgezogene Pakete
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="E-Mail, Name oder Paket suchen"
                         className="border rounded-md pl-8 pr-3 py-1.5 text-sm w-72 max-w-full" />
                </label>
                <button onClick={() => setCreating(!creating)}
                        className="inline-flex items-center gap-1 text-sm bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700">
                  <UserPlus className="w-4 h-4" />Konto hinzufügen
                </button>
              </div>
            </div>
            {creating && (
              <form onSubmit={createAccount} className="p-4 border-b border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <input required type="email" value={account.email} onChange={e => setAccount({ ...account, email: e.target.value })} placeholder="E-Mail" className="border rounded-md px-2 py-1.5" />
                <input required minLength={2} value={account.full_name} onChange={e => setAccount({ ...account, full_name: e.target.value })} placeholder="Vor- und Nachname" className="border rounded-md px-2 py-1.5" />
                <input required minLength={2} value={account.institution} onChange={e => setAccount({ ...account, institution: e.target.value })} placeholder="Schule" className="border rounded-md px-2 py-1.5" />
                <select required value={account.canton} onChange={e => setAccount({ ...account, canton: e.target.value })} className="border rounded-md px-2 py-1.5 bg-white">
                  <option value="">Kanton wählen</option>
                  {CANTONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <select value={account.role} onChange={e => setAccount({ ...account, role: e.target.value })} className="border rounded-md px-2 py-1.5 bg-white">
                  <option value="teacher">Lehrperson</option>
                  <option value="admin">Administrator/in</option>
                </select>
                <input type="password" minLength={8} value={account.password} onChange={e => setAccount({ ...account, password: e.target.value })}
                       placeholder="Passwort (leer lassen: wird erzeugt)" autoComplete="new-password" className="border rounded-md px-2 py-1.5" />
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setCreating(false)} className="text-xs px-3 py-1.5 rounded border border-slate-300">Abbrechen</button>
                  <button type="submit" disabled={busy === 'create'} className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Konto erstellen</button>
                </div>
              </form>
            )}
            <ul className="divide-y divide-slate-100">
              {users.map(u => (
                <li key={u.id} className="p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-slate-900">{u.full_name}</span>
                    <span className="text-sm text-slate-600">{u.email}</span>
                    {u.role === 'admin' && <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded">Admin</span>}
                    <span className="text-xs text-slate-500">{u.institution} · {u.canton} · seit {formatDate(u.created_at)}</span>
                    <span className="ml-auto flex gap-2">
                      {data.email_enabled ? (
                        <button onClick={() => setComposeFor(composeFor === u.id ? '' : u.id)}
                                className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded px-2 py-1 hover:border-slate-500">
                          <Mail className="w-3.5 h-3.5" />E-Mail
                        </button>
                      ) : (
                        <a href={`mailto:${u.email}`} title="Öffnet Ihr E-Mail-Programm (der Hub hat keinen E-Mail-Versand konfiguriert)"
                           className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded px-2 py-1 hover:border-slate-500">
                          <Mail className="w-3.5 h-3.5" />E-Mail
                        </a>
                      )}
                      {u.id !== currentUserId && (
                        <button onClick={() => deleteUser(u)} disabled={busy === u.id || u.packages.length > 0}
                                title={u.packages.length > 0 ? 'Zuerst die aktiven Pakete zurückziehen' : 'Konto löschen'}
                                className="inline-flex items-center gap-1 text-xs border border-slate-300 rounded px-2 py-1 hover:border-red-400 hover:text-red-700 disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-inherit">
                          <UserX className="w-3.5 h-3.5" />Konto löschen
                        </button>
                      )}
                    </span>
                  </div>
                  {composeFor === u.id && (
                    <form onSubmit={e => sendEmail(e, u)} className="mt-3 space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-xs text-slate-500">An {u.email}; Antworten gehen an Ihre Adresse.</div>
                      <input required value={subject} onChange={e => setSubject(e.target.value)} placeholder="Betreff"
                             className="border rounded-md px-2 py-1.5 text-sm w-full" />
                      <textarea required value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Nachricht"
                                className="border rounded-md px-2 py-1.5 text-sm w-full" />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setComposeFor('')} className="text-xs px-3 py-1.5 rounded border border-slate-300">Abbrechen</button>
                        <button type="submit" disabled={busy === u.id} className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Senden</button>
                      </div>
                    </form>
                  )}
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
                            <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600" title="Mitglieder (Lesezugriff) · Bearbeiter/innen · Admins inkl. Ersteller/in">
                              {p.members_count} Mitgl. · {p.editors_count} Bearb. · {p.admins_count} Admin
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
