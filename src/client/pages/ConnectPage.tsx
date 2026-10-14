import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Link2, AlertCircle } from 'lucide-react';
import { api, getToken, getStoredUser } from '../api/client';

/**
 * Consent page of the OAuth flow started from the Moodle plugin ("Konto verknüpfen").
 * Without a login the user is sent to /login and comes back here.
 */
export const ConnectPage: React.FC = () => {
  const location = useLocation();
  const params = Object.fromEntries(new URLSearchParams(location.search));
  const [error, setError] = useState<string>(params.error || '');
  const [busy, setBusy] = useState(false);
  const user = getStoredUser();
  const loggedIn = !!getToken();
  const isRequest = !!params.client_id && !params.error;

  useEffect(() => {
    if (params.error) setError(params.error);
  }, [location.search]);

  const authorize = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.oauthAuthorize(params);
      window.location.href = res.redirect_uri;
    } catch (err: any) {
      if (err.status === 401) {
        window.location.href = `/login?return_to=${encodeURIComponent('/connect' + location.search)}`;
        return;
      }
      setError(err.message || 'Verknüpfung fehlgeschlagen.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto">
          <Link2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Moodle-Konto verknüpfen</h1>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isRequest ? (
          loggedIn ? (
            <>
              <p className="text-sm text-slate-600">
                Ihre Moodle-Instanz darf im Namen von <strong>{user?.full_name || user?.email}</strong> Pakete
                veröffentlichen und herunterladen.
              </p>
              <button
                onClick={authorize}
                disabled={busy}
                className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Verbinde …' : 'Verknüpfung erlauben'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Bitte melden Sie sich zuerst im Question Hub an.</p>
              <Link
                to={`/login?return_to=${encodeURIComponent('/connect' + location.search)}`}
                className="block w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700"
              >
                Anmelden
              </Link>
            </>
          )
        ) : (
          <p className="text-sm text-slate-600">
            Starten Sie die Verknüpfung in Moodle (Fragensammlung → Question Hub → «Konto verknüpfen») erneut.
          </p>
        )}
      </div>
    </div>
  );
};
