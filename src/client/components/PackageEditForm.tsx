import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Save } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  pkg: any;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
  showHeading?: boolean;
}

/** Shared package metadata editor used in the package page and account settings dialog. */
export const PackageEditForm: React.FC<Props> = ({ pkg, onSaved, onCancel, showHeading = true }) => {
  const [title, setTitle] = useState<string>(pkg.title || '');
  const [summary, setSummary] = useState<string>(pkg.summary || '');
  const [license, setLicense] = useState<string>(pkg.license || 'CC-BY-4.0');
  const [grades, setGrades] = useState<string[]>(pkg.taxonomy?.grades || pkg.grades || []);
  const [subjectCategory, setSubjectCategory] = useState<string>(pkg.taxonomy?.subject_category || pkg.subject_category || 'GF');
  const [tags, setTags] = useState<string>((pkg.taxonomy?.tags || pkg.tags || []).join(', '));
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(pkg.preview_enabled !== false);
  const [visibility, setVisibility] = useState<'public' | 'private'>(pkg.visibility === 'private' ? 'private' : 'public');
  const [githubRepo, setGithubRepo] = useState<string>(pkg.github_repo || '');
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  useEffect(() => {
    api.getGitHubConnection().then(c => setGithubLogin(c?.connected ? c.login : null)).catch(() => setGithubLogin(null));
  }, []);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const inputCls = 'mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm bg-white';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.updatePackage(pkg.id, {
        title,
        summary,
        license,
        grades,
        subject_category: subjectCategory,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        preview_enabled: previewEnabled,
        visibility,
        // Only sent when changed: saving re-checks access with the saving admin's GitHub token.
        ...(githubRepo.trim() !== (pkg.github_repo || '') ? { github_repo: githubRepo.trim() } : {}),
      });
      // A newly linked repository receives the current version right away.
      // On a failed commit the form stays open (onSaved reloads and remounts it), so the error remains visible.
      if (res?.github_sync?.status === 'error') {
        setMessage({ ok: false, text: `Einstellungen gespeichert, aber der erste Commit auf GitHub ist fehlgeschlagen: ${res.github_sync.message}` });
        return;
      }
      setMessage({
        ok: true,
        text: !res?.github_sync ? 'Einstellungen gespeichert.'
          : res.github_sync.repo_created ? 'Einstellungen gespeichert. Das private GitHub-Repository ist angelegt und die aktuelle Version committet.'
          : 'Einstellungen gespeichert. Die aktuelle Version ist auf GitHub committet.',
      });
      await onSaved();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Speichern fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      {showHeading && <h2 className="text-base font-bold text-slate-900">Paket-Einstellungen</h2>}
      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 border ${
          message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

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

        <label className="block text-xs font-semibold text-slate-700">
          Kursstufe
          <select className={inputCls} value={subjectCategory} onChange={e => setSubjectCategory(e.target.value)}>
            <option value="GF">Grundlagenfach (GF)</option>
            <option value="SF">Schwerpunktfach (SF)</option>
            <option value="EF">Ergänzungsfach (EF)</option>
            <option value="FF">Freifach (FF)</option>
          </select>
        </label>
        <fieldset className="text-xs font-semibold text-slate-700">
          Zielstufen
          <div className="flex flex-wrap gap-3 mt-3 font-normal">
            {['GYM1', 'GYM2', 'GYM3', 'GYM4'].map(grade => (
              <label key={grade} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={grades.includes(grade)}
                  onChange={e => setGrades(e.target.checked ? [...grades, grade] : grades.filter(item => item !== grade))}
                />
                {grade}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="block text-xs font-semibold text-slate-700">
        Schlagwörter (Komma-getrennt)
        <input className={inputCls} value={tags} onChange={e => setTags(e.target.value)} />
      </label>

      <label className="block text-xs font-semibold text-slate-700">
        Sichtbarkeit
        <select className={inputCls} value={visibility} onChange={e => setVisibility(e.target.value as 'public' | 'private')}>
          <option value="public">Öffentlich</option>
          <option value="private">Privat – Zugriff nur nach Freigabe</option>
        </select>
        <span className="block text-xs font-normal text-slate-500 mt-1">
          Private Pakete erscheinen mit begrenzten Angaben in der Suche. Vorschau und XML bleiben bis zur Freigabe gesperrt.
        </span>
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

      <label className="block text-xs font-semibold text-slate-700">
        GitHub-Repository (optional)
        <input
          className={`${inputCls} font-mono`}
          value={githubRepo}
          onChange={e => setGithubRepo(e.target.value)}
          placeholder="git@github.com:konto/repository.git"
        />
        <span className="block text-xs font-normal text-slate-500 mt-1">
          {githubLogin && (
            <button
              type="button"
              onClick={() => setGithubRepo(`git@github.com:${githubLogin}/${pkg.id}.git`)}
              className="mb-1 mr-2 px-2 py-1 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Neues Repository vorschlagen
            </button>
          )}
          Freiwillig. Ist ein Repository eingetragen, wird jede neue Version als <span className="font-mono">{pkg.id}.xml</span> dorthin
          committet (Commit-Nachricht = Versionshinweise) und mit <span className="font-mono">v&lt;Version&gt;</span> getaggt; beim Verknüpfen
          sofort auch die aktuelle Version. Ein noch nicht existierendes Repository legt der Hub privat an. Dafür braucht
          Ihr Konto eine GitHub-Verbindung (Dashboard, Abschnitt «GitHub-Verbindung») mit Schreibrecht auf das Repository. Leeren Sie das Feld, um die Verbindung zu lösen.
        </span>
      </label>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <p className="text-xs text-slate-500">
          Aktuelle Version: <span className="font-mono">v{pkg.latest_version}</span>. Versionsnummern und Inhalt
          veröffentlichter Versionen sind unveränderlich: Für Änderungen veröffentlichen Sie eine neue Version.
        </p>
        <div className="flex justify-end gap-2 shrink-0">
          {onCancel && (
            <button type="button" onClick={onCancel} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
              Abbrechen
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{busy ? 'Speichern…' : 'Speichern'}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
