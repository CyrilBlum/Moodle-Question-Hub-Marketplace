import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client';
import { PackageEditForm } from './PackageEditForm';

interface Props {
  pkg: any;
  onChanged: () => void;
}

/** Owner-only settings of a package: metadata, preview switch, retract versions or the whole package. */
export const PackageSettings: React.FC<Props> = ({ pkg, onChanged }) => {
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <PackageEditForm pkg={pkg} onSaved={onChanged} />
      </div>

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
