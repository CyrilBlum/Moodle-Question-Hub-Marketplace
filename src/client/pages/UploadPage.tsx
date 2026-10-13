import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UploadCloud, CheckCircle2, AlertTriangle, XCircle, FileText, ArrowRight, BookOpen } from 'lucide-react';
import { api, getToken } from '../api/client';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [xmlContent, setXmlContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preflight, setPreflight] = useState<any>(null);
  const [taxonomy, setTaxonomy] = useState<any>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form Metadata
  const [packageId, setPackageId] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [subject, setSubject] = useState('');
  const [subjectCategory, setSubjectCategory] = useState('GF');
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['GYM2', 'GYM3']);
  const [canton, setCanton] = useState('ZH');
  const [topic, setTopic] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [license, setLicense] = useState('CC-BY-4.0');
  const [releaseNotes, setReleaseNotes] = useState('Erstveröffentlichung');

  useEffect(() => {
    if (!getToken()) {
      navigate('/login?return_to=/upload');
      return;
    }
    api.getTaxonomy().then(setTaxonomy).catch(console.error);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      setErrorMessage('Bitte wählen Sie eine gültige Moodle-XML-Datei (.xml) aus.');
      return;
    }

    setFileName(file.name);
    setErrorMessage('');
    const text = await file.text();
    setXmlContent(text);

    // Run Pre-Flight check
    setLoadingPreflight(true);
    try {
      const rep = await api.preflightXml(text);
      setPreflight(rep);
      setStep(2);

      // Auto-suggest metadata from file name or categories
      if (!title) {
        const cleanName = file.name.replace(/\.xml$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
      if (!packageId) {
        const slug = file.name.replace(/\.xml$/, '').toLowerCase().replace(/[^a-z0-9]/g, '.');
        setPackageId(`ch.gym.pkg.${slug}`);
      }
    } catch (err: any) {
      setErrorMessage(`Pre-Flight Validierungsfehler: ${err.message}`);
    } finally {
      setLoadingPreflight(false);
    }
  };

  const handleGradeToggle = (g: string) => {
    if (selectedGrades.includes(g)) {
      setSelectedGrades(selectedGrades.filter(x => x !== g));
    } else {
      setSelectedGrades([...selectedGrades, g]);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preflight?.can_publish) {
      setErrorMessage('Paket enthält blockierende Fehler und kann nicht veröffentlicht werden.');
      return;
    }

    setPublishing(true);
    setErrorMessage('');

    const metadata = {
      id: packageId.trim(),
      version: version.trim(),
      title: title.trim(),
      summary: summary.trim(),
      language: 'de-CH',
      license,
      taxonomy: {
        framework: 'CH-EDK-RLP',
        canton,
        level: 'GYM_SEK_II',
        grades: selectedGrades,
        subject_category: subjectCategory,
        subject: subject || 'Informatik',
        topic: topic.trim() || undefined,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      },
      release_notes: releaseNotes.trim(),
    };

    try {
      const res = await api.publishPackage(metadata, xmlContent);
      navigate(`/packages/${res.package_id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Veröffentlichung fehlgeschlagen.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Step indicators */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Fragenpaket veröffentlichen</h1>
        <p className="text-sm text-slate-500 mt-1">
          Laden Sie Ihre Moodle-XML-Sammlung hoch. Der Pre-Flight-Prüfer validiert Fragentypen, Anteile und Medien.
        </p>

        <div className="flex items-center space-x-4 mt-6">
          {[
            { num: 1, label: '1. XML-Upload' },
            { num: 2, label: '2. Pre-Flight Prüfung' },
            { num: 3, label: '3. Metadaten & Freigabe' },
          ].map(s => (
            <div
              key={s.num}
              className={`flex items-center space-x-2 text-sm font-medium ${
                step >= s.num ? 'text-red-600' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step >= s.num ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {s.num}
              </div>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start space-x-2">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <label className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-red-500 hover:bg-slate-50 transition block">
            <UploadCloud className="w-12 h-12 text-slate-400 mb-3" />
            <span className="text-base font-semibold text-slate-800">
              {loadingPreflight ? 'Prüfe XML-Datei...' : 'Moodle-XML-Datei hier ablegen oder durchsuchen'}
            </span>
            <span className="text-xs text-slate-500 mt-1">Unterstützt .xml (bis 50 MB) mit Base64-Medien</span>
            <input
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              disabled={loadingPreflight}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Step 2: Pre-Flight Results */}
      {step === 2 && preflight && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Pre-Flight Prüfbericht</h2>
                <span className="text-xs text-slate-500 font-mono">{fileName}</span>
              </div>
              {preflight.can_publish ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Validierung erfolgreich</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                  <XCircle className="w-4 h-4" />
                  <span>Blockierende Fehler gefunden</span>
                </span>
              )}
            </div>

            {/* Statistics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Fragenanzahl</span>
                <span className="text-xl font-bold text-slate-900">{preflight.stats?.question_count}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Kategorien</span>
                <span className="text-xl font-bold text-slate-900">{preflight.stats?.categories_count}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Eingebettete Medien</span>
                <span className="text-xl font-bold text-slate-900">{preflight.stats?.embedded_media_count}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 block">Mediengrösse</span>
                <span className="text-xl font-bold text-slate-900">
                  {Math.round((preflight.stats?.total_media_bytes || 0) / 1024)} KB
                </span>
              </div>
            </div>

            {/* Diagnostics Warnings / Errors */}
            {preflight.diagnostics?.errors?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider">
                  Blockierende Fehler ({preflight.diagnostics.errors.length})
                </h3>
                <div className="space-y-1.5">
                  {preflight.diagnostics.errors.map((err: any, idx: number) => (
                    <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start space-x-2">
                      <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold font-mono">[{err.code}]</span> {err.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preflight.diagnostics?.warnings?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Warnhinweise ({preflight.diagnostics.warnings.length})
                </h3>
                <div className="space-y-1.5">
                  {preflight.diagnostics.warnings.map((warn: any, idx: number) => (
                    <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold font-mono">[{warn.code}]</span> {warn.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
              >
                Andere Datei wählen
              </button>
              {preflight.can_publish && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-sm transition"
                >
                  <span>Weiter zu Metadaten</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Metadata & Publish */}
      {step === 3 && (
        <form onSubmit={handlePublish} className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
            Paket-Metadaten & Lehrplan-Klassifizierung
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Paket-ID (Identifikator)
              </label>
              <input
                type="text"
                required
                value={packageId}
                onChange={e => setPackageId(e.target.value)}
                placeholder="ch.gym.inf.binaere.baeume"
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border font-mono focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Version (SemVer)
              </label>
              <input
                type="text"
                required
                value={version}
                onChange={e => setVersion(e.target.value)}
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border font-mono focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Titel der Fragensammlung
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Zusammenfassung / Pädagogischer Kontext
            </label>
            <textarea
              required
              rows={3}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
            />
          </div>

          {/* Taxonomy Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Fachbereich
              </label>
              <select
                required
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
              >
                <option value="">Fach auswählen...</option>
                {taxonomy?.subjects?.map((s: any) => (
                  <option key={s.id} value={s.name_de}>
                    {s.name_de}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Kursstufe
              </label>
              <select
                value={subjectCategory}
                onChange={e => setSubjectCategory(e.target.value)}
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
              >
                <option value="GF">Grundlagenfach (GF)</option>
                <option value="SF">Schwerpunktfach (SF)</option>
                <option value="EF">Ergänzungsfach (EF)</option>
                <option value="FF">Freifach (FF)</option>
              </select>
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
                {taxonomy?.cantons?.map((c: any) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name_de}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grades Checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Gymnasialstufen (Mehrfachauswahl möglich)
            </label>
            <div className="flex space-x-3">
              {['GYM1', 'GYM2', 'GYM3', 'GYM4'].map(g => (
                <button
                  type="button"
                  key={g}
                  onClick={() => handleGradeToggle(g)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                    selectedGrades.includes(g)
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Thema (Optional)
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="z.B. Datenstrukturen"
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Schlagwörter / Tags (Komma-getrennt)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="Bäume, Graphen, Binärsuche"
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
            >
              Zurück zu Pre-Flight
            </button>
            <button
              type="submit"
              disabled={publishing}
              className="px-6 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-sm transition disabled:opacity-50"
            >
              {publishing ? 'Veröffentliche Paket...' : 'Paket jetzt veröffentlichen'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
