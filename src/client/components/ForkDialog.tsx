import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitFork, X } from 'lucide-react';
import { api } from '../api/client';
import { LicenseOptions, forkLicenses } from './License';

/** Creates a fork of a package (a copy in the own account that can later be proposed back). */
export const ForkDialog: React.FC<{ pkg: any; onClose: () => void }> = ({ pkg, onClose }) => {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [title, setTitle] = useState(`${pkg.title} (Fork)`);
  const [visibility, setVisibility] = useState<'public' | 'private'>(pkg.visibility === 'private' ? 'private' : 'public');
  const allowed = forkLicenses(pkg.license);
  const [license, setLicense] = useState(allowed.includes(pkg.license) ? pkg.license : allowed[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.suggestForkId(pkg.id).then(r => setId(r.id)).catch(() => setId(`${pkg.id}-fork`));
  }, [pkg.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.forkPackage(pkg.id, { id: id.trim(), title: title.trim(), visibility, license });
      navigate(`/packages/${encodeURIComponent(created.package_id)}`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Der Fork konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="fork-title">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between">
          <h2 id="fork-title" className="text-lg font-bold text-slate-900 flex items-center gap-2"><GitFork className="w-5 h-5" />Eigene Kopie anlegen (Fork)</h2>
          <button type="button" onClick={onClose} aria-label="Schliessen" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-slate-600">
          Ein Fork ist Ihre eigene Kopie von <strong>{pkg.title}</strong> (Version {pkg.latest_version}). Sie können sie frei
          bearbeiten und neue Versionen veröffentlichen. Verbesserungen schlagen Sie dem Original später mit einem Änderungsvorschlag vor.
          Das Original bleibt unverändert.
        </p>

        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Mit den Fragen in Moodle arbeiten? Legen Sie die Kopie besser im Moodle-Plugin an (Kategorie › «Forken»): Nur dann bleibt Ihre Kategorie verknüpft.
        </p>
        <label className="block text-sm font-medium text-slate-700">
          Kennung (nicht änderbar)
          <input className={`${input} font-mono`} value={id} onChange={e => setId(e.target.value)} required pattern="[a-z0-9][a-z0-9._\-]{1,98}[a-z0-9]"
            title="Kleinbuchstaben, Ziffern, Punkt, Binde- und Unterstrich" />
          <span className="block mt-0.5 text-xs font-normal text-slate-500">Nur Kleinbuchstaben, Ziffern, Punkt, Binde- und Unterstrich, z.B. {pkg.id}-meier.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Titel
          <input className={input} value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={200} />
        </label>
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
          {pkg.visibility === 'private' ? 'Ein Fork eines privaten Pakets bleibt privat. ' : ''}
          Der Fork nennt das Original und seine Urheberschaft.
          {pkg.license === 'CC-BY-SA-4.0' && ' Das Original steht unter CC BY-SA: Bearbeitungen müssen dieselbe Lizenz behalten.'}
          {pkg.license === 'CC-BY-4.0' && ' Zulässig sind CC BY oder CC BY-SA.'}
        </p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Abbrechen</button>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Wird erstellt …' : 'Kopie anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
};
