import React from 'react';

export const LICENSES: Record<string, { short: string; name: string; url: string }> = {
  'CC-BY-4.0': { short: 'CC BY 4.0', name: 'Namensnennung 4.0 International', url: 'https://creativecommons.org/licenses/by/4.0/deed.de' },
  'CC-BY-SA-4.0': { short: 'CC BY-SA 4.0', name: 'Namensnennung – Weitergabe unter gleichen Bedingungen 4.0 International', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.de' },
  'CC0-1.0': { short: 'CC0 1.0', name: 'Public Domain Dedication (gemeinfrei)', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.de' },
};

/** Licences a fork may use (mirrors compatibleForkLicenses on the server). */
export function forkLicenses(original: string | null | undefined): string[] {
  if (original === 'CC-BY-SA-4.0') return ['CC-BY-SA-4.0'];
  if (original === 'CC-BY-4.0') return ['CC-BY-4.0', 'CC-BY-SA-4.0'];
  return Object.keys(LICENSES);
}

export const LicenseBadge: React.FC<{ license: string; className?: string }> = ({ license, className = '' }) => {
  const info = LICENSES[license];
  if (!license) return null;
  return info ? (
    <a href={info.url} target="_blank" rel="noopener noreferrer license" title={`Creative Commons ${info.name}`}
      className={`text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded hover:underline ${className}`}>
      {info.short}
    </a>
  ) : <span className={`text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded ${className}`}>{license}</span>;
};

/** Licence options for a select; `allowed` limits them (forks). */
export const LicenseOptions: React.FC<{ allowed?: string[] }> = ({ allowed }) => (
  <>
    {Object.entries(LICENSES).filter(([id]) => !allowed || allowed.includes(id)).map(([id, info]) => (
      <option key={id} value={id}>{info.short} ({info.name})</option>
    ))}
  </>
);

/** What publishing means: the questions are open content under the chosen CC licence. */
export const OpenContentNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={`text-xs text-slate-600 leading-relaxed ${className}`}>
    Mit der Veröffentlichung stellen Sie die Fragen unter die gewählte{' '}
    <a href="https://creativecommons.org/licenses/?lang=de" target="_blank" rel="noopener noreferrer" className="text-red-700 hover:underline">Creative-Commons-Lizenz</a>.
    Öffentliche Pakete sind damit offene Bildungsmaterialien (Open Educational Resources): Alle dürfen sie herunterladen,
    verwenden, verändern, als eigene Variante weiterentwickeln und weitergeben, unter Nennung der Urheberschaft (ausser bei CC0) und bei CC BY-SA unter
    derselben Lizenz. Private Pakete tragen die Lizenz ebenfalls, sind aber nur für freigegebene Personen sichtbar.
    Veröffentlichen Sie nur Inhalte, an denen Sie die Rechte haben.
  </p>
);
