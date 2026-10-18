import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitFork, X } from 'lucide-react';
import { api } from '../api/client';
import { LicenseOptions, forkLicenses } from './License';
import { useEscapeKey } from '../utils/useEscapeKey';

/** Creates a variant (fork) of the shown package; `root` is the original whose page shows it. */
export const ForkDialog: React.FC<{ pkg: any; root?: any; onClose: () => void }> = ({ pkg, root, onClose }) => {
  const navigate = useNavigate();
  const [visibility, setVisibility] = useState<'public' | 'private'>(pkg.visibility === 'private' ? 'private' : 'public');
  const allowed = forkLicenses(pkg.license);
  const [license, setLicense] = useState(allowed.includes(pkg.license) ? pkg.license : allowed[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEscapeKey(!busy, onClose);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.forkPackage(pkg.id, { visibility, license });
      navigate(`/packages/${encodeURIComponent(root?.id || pkg.id)}?variante=${encodeURIComponent(created.package_id)}`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Die Variante konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="fork-title">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between">
          <h2 id="fork-title" className="text-lg font-bold text-slate-900 flex items-center gap-2"><GitFork className="w-5 h-5" />Variante anlegen</h2>
          <button type="button" onClick={onClose} aria-label="Schliessen" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-slate-600">
          Eine Variante ist Ihre eigene Weiterentwicklung von <strong>{pkg.title}</strong> (Version {pkg.latest_version}). Sie
          bearbeiten sie frei und veröffentlichen neue Versionen; sie erscheint auf der Seite des Originals.
          Verbesserungen schlagen Sie dem Original später mit einem Änderungsvorschlag vor. Das Original bleibt unverändert.
        </p>

        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Mit den Fragen in Moodle arbeiten? Legen Sie die Variante besser im Moodle-Plugin an (Kategorie › «Variante anlegen»): Nur dann bleibt Ihre Kategorie verknüpft.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Sichtbarkeit
            <select className={input} value={visibility} onChange={e => setVisibility(e.target.value as any)} disabled={pkg.visibility === 'private'}>
              <option value="public">Öffentlich</option>
              <option value="private">Privat</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Lizenz
            <select className={input} value={license} onChange={e => setLicense(e.target.value)} disabled={allowed.length === 1}>
              <LicenseOptions allowed={allowed} />
            </select>
            {allowed.length === 1 && <span className="block mt-0.5 text-xs font-normal text-slate-500">Vom Original vorgegeben</span>}
          </label>
        </div>
        <p className="text-xs text-slate-500">
          {pkg.visibility === 'private' ? 'Eine Variante eines privaten Pakets bleibt privat. ' : ''}
          Die Variante nennt das Original und seine Urheberschaft.
          {pkg.license === 'CC-BY-SA-4.0' && ' Das Original steht unter CC BY-SA: Bearbeitungen müssen dieselbe Lizenz behalten.'}
          {pkg.license === 'CC-BY-4.0' && ' Zulässig sind CC BY oder CC BY-SA.'}
        </p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Abbrechen</button>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Wird angelegt …' : 'Variante anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
};
