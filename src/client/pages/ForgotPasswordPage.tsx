import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { Captcha, CaptchaHandle } from '../components/Captcha';

/** "Passwort vergessen": asks for the e-mail address and sends a reset link. */
export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaHandle>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captcha) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.forgotPassword(email.trim(), captcha);
      setSent(res.message);
    } catch (err: any) {
      setError(err.message || 'Die Anfrage ist fehlgeschlagen. Bitte versuchen Sie es später erneut.');
      captchaRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Passwort vergessen</h1>
          <p className="text-xs text-slate-500">Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen.</p>
        </div>

        {sent ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-start gap-2" role="status">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{sent} Prüfen Sie auch den Spam-Ordner.</span>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2" role="alert">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              E-Mail-Adresse Ihres Kontos
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="lehrperson@kanti.ch"
                className="mt-1 w-full text-sm font-normal normal-case tracking-normal border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white" />
            </label>
            <Captcha ref={captchaRef} onChange={setCaptcha} />
            <button type="submit" disabled={loading || !captcha}
              className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 shadow-sm transition disabled:opacity-50">
              {loading ? 'Wird gesendet …' : 'Link senden'}
            </button>
          </form>
        )}

        <div className="text-center text-xs text-slate-500 border-t border-slate-100 pt-4">
          <Link to="/login" className="font-semibold text-red-600 hover:underline">Zurück zur Anmeldung</Link>
        </div>
      </div>
    </div>
  );
};
