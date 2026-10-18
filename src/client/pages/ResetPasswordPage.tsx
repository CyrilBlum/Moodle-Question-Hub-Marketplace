import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';

/** Target of the reset link in the e-mail: sets a new password with the one-time token. */
export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setValid(false); return; }
    api.checkResetToken(token).then(r => setValid(!!r.valid)).catch(() => setValid(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) { setError('Die beiden Passwörter stimmen nicht überein.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Das Passwort konnte nicht geändert werden.');
    } finally {
      setLoading(false);
    }
  };

  const input = 'mt-1 w-full text-sm font-normal normal-case tracking-normal border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white';
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Neues Passwort festlegen</h1>
        </div>

        {valid === null && <p className="text-sm text-slate-500 text-center">Link wird geprüft …</p>}
        {valid === false && !done && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-700">Dieser Link ist ungültig, abgelaufen oder wurde schon verwendet.</p>
            <Link to="/passwort-vergessen" className="inline-block px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Neuen Link anfordern</Link>
          </div>
        )}
        {done && (
          <div className="space-y-3 text-center" role="status">
            <p className="text-sm text-emerald-800 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />Ihr Passwort wurde geändert.</p>
            <Link to="/login" className="inline-block px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Zur Anmeldung</Link>
          </div>
        )}
        {valid && !done && (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2" role="alert">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Neues Passwort (mindestens 8 Zeichen)
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={input} />
            </label>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Passwort wiederholen
              <input type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} className={input} />
            </label>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 shadow-sm transition disabled:opacity-50">
              {loading ? 'Wird gespeichert …' : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
