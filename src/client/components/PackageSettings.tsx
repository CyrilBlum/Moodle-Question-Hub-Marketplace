import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2, AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  pkg: any;
  onChanged: () => void;
}

/** Owner-only settings of a package: metadata, preview switch, retract versions or the whole package. */
export const PackageSettings: React.FC<Props> = ({ pkg, onChanged }) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState<string>(pkg.title || '');
  const [summary, setSummary] = useState<string>(pkg.summary || '');
  const [license, setLicense] = useState<string>(pkg.license || 'CC-BY-4.0');
  const [grades, setGrades] = useState<string[]>(pkg.taxonomy?.grades || []);
  const [tags, setTags] = useState<string>((pkg.taxonomy?.tags || []).join(', '));
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(pkg.preview_enabled !== false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.updatePackage(pkg.id, {
        title,
        summary,
        license,
        grades,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        preview_enabled: previewEnabled,
      });
      setMessage({ ok: true, text: 'Einstellungen gespeichert.' });
      onChanged();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Speichern fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  const retractVersion = async (version: string) => {
    if (!confirm(`Version ${version} zurückziehen? Die Versionsnummer kann nie wieder verwendet werden.`)) return;
    try {
      await api.withdrawRelease(pkg.id, version);
      setMessage({ ok: true, text: `Version ${version} zurückgezogen.` });
      onChanged();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Zurückziehen fehlgeschlagen.' });
    }
  };

  const retractPackage = async () => {
    if (!confirm(`Paket «${pkg.title}» mit allen Versionen endgültig zurückziehen? In Moodle importierte Fragen bleiben dort erhalten.`)) return;
    try {
      await api.withdrawPackage(pkg.id);
      navigate('/dashboard');
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Zurückziehen fehlgeschlagen.' });
    }
  };

  const inputCls = 'mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm bg-white';
  const releases: any[] = pkg.releases || [];

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-start space-x-2 border ${
            message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {message.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Paket-Einstellungen</h2>

        <label className="block text-xs font-semibold text-slate-700">
          Titel
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required />
        </label>

        <label className="block text-xs font-semibold text-slate-700">
          Beschreibung
          <textarea className={inputCls} rows={4} value={summary} onChange={e => setSummary(e.target.value)} required />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-xs font-semibold text-slate-700">
            Lizenz
            <select className={inputCls} value={license} onChange={e => setLicense(e.target.value)}>
              <option value="CC-BY-4.0">CC-BY-4.0 (Namensnennung)</option>
              <option value="CC-BY-SA-4.0">CC-BY-SA-4.0 (Weitergabe unter gleichen Bedingungen)</option>
              <option value="CC0-1.0">CC0-1.0 (Gemeinfrei)</option>
            </select>
          </label>

          <fieldset className="text-xs font-semibold text-slate-700">
            Zielstufen
            <div className="flex gap-4 mt-3 font-normal">
              {['GYM1', 'GYM2', 'GYM3', 'GYM4'].map(g => (
                <label key={g} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={grades.includes(g)}
                    onChange={e => setGrades(e.target.checked ? [...grades, g] : grades.filter(x => x !== g))}
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="block text-xs font-semibold text-slate-700">
          Schlagwörter (Komma-getrennt)
          <input className={inputCls} value={tags} onChange={e => setTags(e.target.value)} />
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={previewEnabled}
            onChange={e => setPreviewEnabled(e.target.checked)}
          />
          <span>
            Öffentliche Vorschau der Fragen anzeigen
            <span className="block text-xs text-slate-500">
              Musterlösungen und Feedback werden nie angezeigt. Ohne Vorschau entfällt das Tab «Vorschau» und das Etikett.
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-500">
            Aktuelle Version: <span className="font-mono">v{pkg.latest_version}</span>. Versionsnummern und Inhalt
            veröffentlichter Versionen sind unveränderlich: Für Änderungen veröffentlichen Sie eine neue Version.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>Speichern</span>
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
        <h2 className="text-base font-bold text-slate-900">Versionen zurückziehen</h2>
        <div className="divide-y divide-slate-100">
          {releases.map(rel => (
            <div key={rel.version} className="py-2 flex items-center justify-between">
              <span className="font-mono text-sm text-slate-800">
                v{rel.version}
                {rel.version === pkg.latest_version && (
                  <span className="ml-2 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                    aktuell
                  </span>
                )}
              </span>
              <button
                onClick={() => retractVersion(rel.version)}
                disabled={releases.length < 2}
                title={releases.length < 2 ? 'Letzte Version: ziehen Sie stattdessen das ganze Paket zurück.' : ''}
                className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Zurückziehen
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-red-50 rounded-xl border border-red-200 p-6 space-y-2">
        <h2 className="text-base font-bold text-red-800">Paket zurückziehen</h2>
        <p className="text-xs text-red-700">
          Entfernt das Paket mit allen Versionen aus dem Question Hub. Bereits in Moodle importierte Fragen bleiben
          erhalten. Das kann nicht rückgängig gemacht werden.
        </p>
        <button
          onClick={retractPackage}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100"
        >
          <Trash2 className="w-4 h-4" />
          <span>Ganzes Paket zurückziehen</span>
        </button>
      </div>
    </div>
  );
};
