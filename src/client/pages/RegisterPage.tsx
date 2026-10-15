import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { Captcha, CaptchaHandle } from '../components/Captcha';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institution, setInstitution] = useState('');
  const [canton, setCanton] = useState('ZH');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captcha) return;
    setLoading(true);
    setErrorMsg('');

    try {
      await api.register({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        institution: institution.trim(),
        canton: canton.trim().toUpperCase(),
        altcha: captcha,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Registrierung fehlgeschlagen.');
      captchaRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-3">
            <UserPlus className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Lehrperson-Registrierung</h1>
          <p className="text-xs text-slate-500">Kostenloses Konto für Schweizer Mittelschullehrpersonen</p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Vor- und Nachname
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Dr. Anna Keller"
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Schulische E-Mail-Adresse
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="anna.keller@kanti.ch"
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Mittelschule / Gymnasium
            </label>
            <input
              type="text"
              required
              value={institution}
              onChange={e => setInstitution(e.target.value)}
              placeholder="Kantonsschule Rämibühl"
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Kanton
            </label>
            <select
              value={canton}
              onChange={e => setCanton(e.target.value)}
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            >
              {['ZH', 'BE', 'BS', 'BL', 'LU', 'SG', 'AG', 'SO', 'TG', 'GR', 'SH', 'ZG', 'SZ', 'UR', 'OW', 'NW', 'GL', 'AI', 'AR', 'VS', 'FR'].map(c => (
                <option key={c} value={c}>
                  Kanton {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Passwort (mind. 8 Zeichen)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            />
          </div>

          <Captcha ref={captchaRef} onChange={setCaptcha} />

          <button
            type="submit"
            disabled={loading || !captcha}
            className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 shadow-sm transition disabled:opacity-50"
          >
            {loading ? 'Konto wird erstellt...' : 'Konto erstellen'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 border-t border-slate-100 pt-4">
          Bereits registriert?{' '}
          <Link to="/login" className="font-semibold text-red-600 hover:underline">
            Hier anmelden
          </Link>
        </div>
      </div>
    </div>
  );
};
