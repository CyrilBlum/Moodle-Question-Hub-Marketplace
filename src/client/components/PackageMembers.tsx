import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, UserPlus } from 'lucide-react';
import { api } from '../api/client';

type Role = 'member' | 'editor' | 'admin';

const ROLE_OPTIONS: Array<{ value: Role; label: string; help: string }> = [
  { value: 'member', label: 'Mitglied', help: 'sieht das Paket (auch wenn es privat ist) und kann es importieren' },
  { value: 'editor', label: 'Bearbeiter/in', help: 'kann zusätzlich neue Versionen veröffentlichen (Fragen ändern, hinzufügen, löschen)' },
  { value: 'admin', label: 'Admin', help: 'kann zusätzlich Einstellungen, Mitwirkende und Zugriffsanfragen verwalten und das Paket zurückziehen' },
];
const roleLabel = (role: Role) => ROLE_OPTIONS.find(o => o.value === role)?.label || role;

/** Members of a package with their roles; package admins add people by e-mail, change roles and remove them. */
export const PackageMembers: React.FC<{ packageId: string }> = ({ packageId }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const result = await api.getPackageMembers(packageId);
      setMembers(result.members || []);
      setCanManage(!!result.can_manage);
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Mitwirkende konnten nicht geladen werden.' });
    }
  };

  useEffect(() => { load(); }, [packageId]);

  const run = async (action: () => Promise<any>, success: (result: any) => string) => {
    setBusy(true);
    try {
      const result = await action();
      setMessage({ ok: true, text: success(result) });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Aktion fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    run(() => api.addPackageMember(packageId, address, role), result => {
      setEmail('');
      return `${address} ist jetzt ${roleLabel(role)}.${result?.notification_sent ? ' Die Person wurde per E-Mail benachrichtigt.' : ''}`;
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Mitwirkende</h2>
        <ul className="mt-1 text-xs text-slate-500 space-y-0.5">
          {ROLE_OPTIONS.map(o => <li key={o.value}><span className="font-medium text-slate-600">{o.label}:</span> {o.help}</li>)}
        </ul>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 border ${
          message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {members.map(m => (
          <div key={m.user_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              <div className="font-medium">{m.name}{m.institution ? ` · ${m.institution}` : ''}</div>
              {m.email && <a href={`mailto:${m.email}`} className="text-xs text-slate-500 hover:underline">{m.email}</a>}
            </div>
            <div className="flex items-center gap-2">
              {m.is_creator || !canManage ? (
                <span className="text-xs text-slate-600">{roleLabel(m.role)}{m.is_creator ? ' (Ersteller/in)' : ''}</span>
              ) : (
                <>
                  <select
                    value={m.role}
                    disabled={busy}
                    aria-label={`Rolle von ${m.name}`}
                    onChange={e => run(() => api.setPackageMemberRole(packageId, m.user_id, e.target.value as Role),
                      () => `${m.name} ist jetzt ${roleLabel(e.target.value as Role)}.`)}
                    className="text-xs border border-slate-300 rounded px-2 py-1"
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`${m.name} aus dem Paket entfernen?`)) return;
                      run(() => api.removePackageMember(packageId, m.user_id), () => `${m.name} wurde entfernt.`);
                    }}
                    className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                  >
                    Entfernen
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={add} className="pt-2 border-t border-slate-100 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor="member-email" className="block text-xs font-medium text-slate-600 mb-1">E-Mail-Adresse eines Hub-Kontos</label>
            <input
              id="member-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="member-role" className="block text-xs font-medium text-slate-600 mb-1">Rolle</label>
            <select id="member-role" value={role} onChange={e => setRole(e.target.value as Role)}
                    className="text-sm border border-slate-300 rounded-lg px-2 py-2">
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            <UserPlus className="w-4 h-4" />Hinzufügen
          </button>
        </form>
      )}
    </div>
  );
};
