import { buildCategoryTree } from '../utils/categoryTree';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Download, Eye, FileQuestion, BookOpen, Layers, CheckCircle } from 'lucide-react';
import { api } from '../api/client';

export const HomePage: React.FC = () => {
  const [packages, setPackages] = useState<any[]>([]);
  const [taxonomy, setTaxonomy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedCanton, setSelectedCanton] = useState('');

  useEffect(() => {
    loadTaxonomy();
    loadPackages();
  }, []);

  const loadTaxonomy = async () => {
    try {
      const data = await api.getTaxonomy();
      setTaxonomy(data);
    } catch (err) {
      console.error('Fehler beim Laden der Taxonomie:', err);
    }
  };

  const loadPackages = async (overrides: Record<string, any> = {}) => {
    setLoading(true);
    try {
      const params = {
        q: overrides.q !== undefined ? overrides.q : search,
        subject: overrides.subject !== undefined ? overrides.subject : selectedSubject,
        grade: overrides.grade !== undefined ? overrides.grade : selectedGrade,
        level: overrides.level !== undefined ? overrides.level : selectedLevel,
        canton: overrides.canton !== undefined ? overrides.canton : selectedCanton,
      };
      const res = await api.getPackages(params);
      setPackages(res.data || []);
    } catch (err) {
      console.error('Fehler beim Laden der Pakete:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPackages();
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedSubject('');
    setSelectedGrade('');
    setSelectedLevel('');
    setSelectedCanton('');
    loadPackages({ q: '', subject: '', grade: '', level: '', canton: '' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl text-white p-8 mb-8 shadow-sm">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 bg-red-600/30 text-red-200 border border-red-500/30 px-3 py-1 rounded-full text-xs font-medium mb-3">
            <span>🇨🇭 Gymnasiallehrplan EDK / MAR</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Moodle Fragekatalog für Schweizer Mittelschulen
          </h1>
          <p className="mt-3 text-slate-300 text-base sm:text-lg">
            Austausch geprüfter Fragensammlungen für gymnasiale Fachbereiche. Vollständige Wahrung von Prüfungsfragen,
            Punkten, Cloze-Syntax und eingebetteten Medien.
          </p>
        </div>
      </div>

      {/* Main Grid: Sidebar Filters + Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm sticky top-20 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="font-semibold text-slate-900 flex items-center space-x-2">
                <Filter className="w-4 h-4 text-red-600" />
                <span>Filter</span>
              </span>
              {(selectedSubject || selectedGrade || selectedLevel || selectedCanton || search) && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Zurücksetzen
                </button>
              )}
            </div>

            {/* Subject Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Fachbereich
              </label>
              <select
                value={selectedSubject}
                onChange={e => {
                  setSelectedSubject(e.target.value);
                  loadPackages({ subject: e.target.value });
                }}
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white focus:ring-1 focus:ring-red-500"
              >
                <option value="">Alle Fachbereiche</option>
                {taxonomy?.subjects?.map((s: any) => (
                  <option key={s.id} value={s.name_de}>
                    {s.name_de} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Gymnasialstufe */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Gymnasialstufe
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {['GYM1', 'GYM2', 'GYM3', 'GYM4'].map(grade => (
                  <button
                    key={grade}
                    onClick={() => {
                      const next = selectedGrade === grade ? '' : grade;
                      setSelectedGrade(next);
                      loadPackages({ grade: next });
                    }}
                    className={`py-1.5 px-3 text-xs font-medium rounded-md border text-center transition ${
                      selectedGrade === grade
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>

            {/* Kursstufe */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Kursstufe
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { code: 'GF', label: 'Grundlagenfach (GF)' },
                  { code: 'SF', label: 'Schwerpunkt (SF)' },
                  { code: 'EF', label: 'Ergänzung (EF)' },
                  { code: 'FF', label: 'Freifach (FF)' },
                ].map(lvl => (
                  <button
                    key={lvl.code}
                    onClick={() => {
                      const next = selectedLevel === lvl.code ? '' : lvl.code;
                      setSelectedLevel(next);
                      loadPackages({ level: next });
                    }}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md border text-center transition ${
                      selectedLevel === lvl.code
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {lvl.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Kanton */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Kanton
              </label>
              <select
                value={selectedCanton}
                onChange={e => {
                  setSelectedCanton(e.target.value);
                  loadPackages({ canton: e.target.value });
                }}
                className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white focus:ring-1 focus:ring-red-500"
              >
                <option value="">Alle Kantone (Schweizweit)</option>
                {taxonomy?.cantons?.map((c: any) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name_de}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Catalog List */}
        <div className="lg:col-span-3 space-y-6">
          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Fragensammlungen, Themen, Autoren oder Tags suchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-24 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
            />
            <button
              type="submit"
              className="absolute right-2 top-2 bottom-2 px-4 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition"
            >
              Suchen
            </button>
          </form>

          {/* Results summary */}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {loading ? 'Lade Pakete...' : `${packages.length} Fragenpaket${packages.length === 1 ? '' : 'e'} gefunden`}
            </span>
          </div>

          {/* Packages Grid */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(n => (
                <div key={n} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse space-y-4">
                  <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : packages.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <FileQuestion className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-900">Keine Fragenpakete gefunden</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                Es wurden keine Pakete für die ausgewählten Filterkriterien gefunden. Passen Sie die Filter an oder laden Sie selbst ein neues Paket hoch.
              </p>
              <div className="mt-5">
                <Link
                  to="/upload"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-sm transition"
                >
                  <span>Erstes Paket veröffentlichen</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {packages.map(pkg => (
                <div
                  key={pkg.id}
                  className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:border-slate-300 transition flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Title and SemVer Badge */}
                    <div className="flex items-start justify-between">
                      <div>
                        <Link
                          to={`/packages/${pkg.id}`}
                          className="text-lg font-bold text-slate-900 hover:text-red-600 transition"
                        >
                          {pkg.title}
                        </Link>
                        <div className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                          <span className="font-medium text-slate-700">{pkg.author?.name}</span>
                          {pkg.author?.institution && (
                            <>
                              <span>•</span>
                              <span>{pkg.author.institution}</span>
                            </>
                          )}
                          {pkg.author?.canton && (
                            <>
                              <span>•</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                Kt. {pkg.author.canton}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                          v{pkg.latest_version}
                        </span>
                        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                          {pkg.license}
                        </span>
                        {pkg.preview_enabled !== false && (
                          <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded">
                            Vorschau
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary */}
                    <p className="text-sm text-slate-600 mt-3 line-clamp-2">{pkg.summary}</p>

                    {/* Taxonomy Tags */}
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                        <BookOpen className="w-3 h-3 mr-1" />
                        {pkg.taxonomy?.subject}
                      </span>
                      {pkg.taxonomy?.subject_category && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {pkg.taxonomy.subject_category}
                        </span>
                      )}
                      {pkg.taxonomy?.grades?.map((g: string) => (
                        <span key={g} className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {g}
                        </span>
                      ))}
                      {pkg.taxonomy?.topic && (
                        <span className="px-2 py-1 rounded-md text-xs bg-slate-50 text-slate-600 border border-slate-200">
                          {pkg.taxonomy.topic}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer stats & Actions */}
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center space-x-4">
                      <span className="flex items-center space-x-1 font-medium text-slate-700">
                        <Layers className="w-4 h-4 text-slate-400" />
                        <span>{pkg.stats?.question_count || 0} Fragen</span>
                      </span>
                      <span>{pkg.stats?.downloads_count || 0} Downloads</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <a
                        href={`/api/v1/packages/${pkg.id}/releases/${pkg.latest_version}/download`}
                        download
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium transition"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>XML</span>
                      </a>
                      <Link
                        to={`/packages/${pkg.id}`}
                        className="inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-medium shadow-sm transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
