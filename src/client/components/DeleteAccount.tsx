import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertCircle } from 'lucide-react';
import { api, clearToken } from '../api/client';

/** Deletes the own account and its data, after showing what happens to the own packages. */
export const DeleteAccount: React.FC = () => {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<{ withdraw: any[]; transfer: any[]; blocked_reason: string | null } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = async () => {
    setError('');
    try {
      setPlan(await api.getAccountDeletionPlan());
    } catch (err: any) {
      setError(err.message || 'Die Angaben zur Löschung konnten nicht geladen werden.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(password);
      clearToken();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Das Konto konnte nicht gelöscht werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="konto-loeschen" className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
        <Trash2 className="w-5 h-5 text-red-600" />
        <span>Konto löschen</span>
      </h2>
      <p className="text-sm text-slate-600">
        Löscht Ihr Hub-Konto mit Profil, Tokens, GitHub-Verbindung, Mitgliedschaften und Zugriffsanfragen.
        Ihre Kommentare in Änderungsvorschlägen bleiben ohne Namen stehen. In Moodle importierte Fragen bleiben dort erhalten.
      </p>
      {!plan ? (
        <button onClick={open} className="px-3 py-2 border border-red-300 text-red-700 rounded text-xs hover:bg-red-50">
          Konto löschen …
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 text-sm">
          {plan.blocked_reason && (
            <p className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">{plan.blocked_reason}</p>
          )}
          {plan.withdraw.length > 0 && (
            <div>
              <p className="font-semibold text-slate-800">Diese Pakete werden mit allen Versionen zurückgezogen:</p>
              <ul className="list-disc ml-5 text-slate-600">
                {plan.withdraw.map(p => <li key={p.id}>{p.title} <span className="font-mono text-xs">({p.id})</span></li>)}
              </ul>
            </div>
          )}
          {plan.transfer.length > 0 && (
            <div>
              <p className="font-semibold text-slate-800">Diese Pakete gehen an eine andere Admin-Person des Pakets über:</p>
              <ul className="list-disc ml-5 text-slate-600">
                {plan.transfer.map(p => <li key={p.id}>{p.title} an {p.new_owner_name}</li>)}
              </ul>
            </div>
          )}
          {plan.withdraw.length === 0 && plan.transfer.length === 0 && (
            <p className="text-slate-600">Sie besitzen keine Pakete.</p>
          )}
          <p className="text-slate-800">Die Löschung lässt sich nicht rückgängig machen.</p>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Passwort zur Bestätigung"
            className="border rounded p-2 w-full sm:w-72"
          />
          {error && (
            <p className="text-xs text-red-600 flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{error}</span></p>
          )}
          <div className="flex space-x-2">
            <button type="button" onClick={() => { setPlan(null); setPassword(''); setError(''); }}
              className="px-3 py-2 border border-slate-300 rounded text-xs">Abbrechen</button>
            <button type="submit" disabled={busy || !!plan.blocked_reason || !password}
              className="px-3 py-2 bg-red-600 text-white rounded text-xs disabled:opacity-50">Konto endgültig löschen</button>
          </div>
        </form>
      )}
      {!plan && error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
