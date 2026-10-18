import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Download, Eye, FileQuestion, Filter, GitFork, Layers, Search, Upload } from 'lucide-react';
import { api } from '../api/client';
import { QuestionTypeBadges } from '../components/QuestionTypeBadges';
import { LicenseBadge } from '../components/License';

const PAGE_SIZE = 20;

export const HomePage: React.FC = () => {
  const [packages, setPackages] = useState<any[]>([]);
  const [taxonomy, setTaxonomy] = useState<any>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedCanton, setSelectedCanton] = useState('');
  const requestNumber = useRef(0);

  const currentFilters = () => ({
    q: search,
    subject: selectedSubject,
    grade: selectedGrade,
    level: selectedLevel,
    canton: selectedCanton,
  });

  const loadPackages = async (page = 1, overrides: Record<string, string> = {}) => {
    const requestId = ++requestNumber.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.getPackages({ ...currentFilters(), ...overrides, page, limit: PAGE_SIZE });
      if (requestId !== requestNumber.current) return;
      setPackages(res.data || []);
      setPagination(res.pagination || { page, limit: PAGE_SIZE, total: (res.data || []).length, total_pages: 1 });
    } catch (err: any) {
      if (requestId !== requestNumber.current) return;
      setPackages([]);
      setError(err.message || 'Der Katalog konnte nicht geladen werden.');
    } finally {
      if (requestId === requestNumber.current) setLoading(false);
    }
  };

  useEffect(() => {
    api.getTaxonomy().then(setTaxonomy).catch(() => setError('Die Filter konnten nicht geladen werden.'));
    loadPackages();
  }, []);

  const setFilter = (name: 'subject' | 'grade' | 'level' | 'canton', value: string) => {
    if (name === 'subject') setSelectedSubject(value);
    if (name === 'grade') setSelectedGrade(value);
    if (name === 'level') setSelectedLevel(value);
    if (name === 'canton') setSelectedCanton(value);
    loadPackages(1, { [name]: value });
  };

  const resetFilters = () => {
    setSearch(''); setSelectedSubject(''); setSelectedGrade(''); setSelectedLevel(''); setSelectedCanton('');
    loadPackages(1, { q: '', subject: '', grade: '', level: '', canton: '' });
  };

  const hasFilters = Boolean(search || selectedSubject || selectedGrade || selectedLevel || selectedCanton);
  const total = pagination.total || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="border-b border-slate-200 pb-8 mb-8">
        <p className="text-sm font-semibold text-red-700">Moodle Question Hub · Schweizer Mittelschulen</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Fragensammlungen finden und in Moodle importieren</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">Durchsuchen Sie veröffentlichte Moodle-XML-Pakete nach Fach, Kursstufe und Thema. Öffnen Sie die Details, prüfen Sie die Vorschau und importieren Sie das Paket über das Question-Hub-Plugin in Ihre Fragensammlung.</p>
          </div>
          <Link to="/upload" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2">
            <Upload className="w-4 h-4" /> Paket veröffentlichen
          </Link>
        </div>
        <ol className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {['1. Paket auswählen', '2. Inhalte und Version prüfen', '3. In Moodle importieren'].map(step => <li key={step} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">{step}</li>)}
        </ol>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Filter className="h-4 w-4 text-red-700" /> Filter</h2>
              {hasFilters && <button onClick={resetFilters} className="text-xs font-semibold text-red-700 hover:underline focus:outline-none focus:ring-2 focus:ring-red-600">Zurücksetzen</button>}
            </div>
            <label className="block text-sm font-medium text-slate-700">Fachbereich
              <select value={selectedSubject} onChange={e => setFilter('subject', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                <option value="">Alle Fachbereiche</option>
                {taxonomy?.subjects?.map((s: any) => <option key={s.id} value={s.name_de}>{s.name_de} ({s.code})</option>)}
              </select>
            </label>
            <fieldset><legend className="text-sm font-medium text-slate-700">Gymnasialstufe</legend><div className="mt-2 grid grid-cols-2 gap-2">
              {['GYM1', 'GYM2', 'GYM3', 'GYM4'].map(grade => <button key={grade} onClick={() => setFilter('grade', selectedGrade === grade ? '' : grade)} className={`rounded-md border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-600 ${selectedGrade === grade ? 'border-red-700 bg-red-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{grade}</button>)}
            </div></fieldset>
            <fieldset><legend className="text-sm font-medium text-slate-700">Kursstufe</legend><div className="mt-2 grid grid-cols-2 gap-2">
              {['GF', 'SF', 'EF', 'FF'].map(level => <button key={level} title={({ GF: 'Grundlagenfach', SF: 'Schwerpunktfach', EF: 'Ergänzungsfach', FF: 'Freifach' } as Record<string, string>)[level]} onClick={() => setFilter('level', selectedLevel === level ? '' : level)} className={`rounded-md border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-600 ${selectedLevel === level ? 'border-red-700 bg-red-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{level}</button>)}
            </div></fieldset>
            <label className="block text-sm font-medium text-slate-700">Kanton
              <select value={selectedCanton} onChange={e => setFilter('canton', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                <option value="">Alle Kantone</option>
                {taxonomy?.cantons?.map((c: any) => <option key={c.code} value={c.code}>{c.code} — {c.name_de}</option>)}
              </select>
            </label>
          </div>
        </aside>

        <main className="space-y-5 lg:col-span-3">
          <form onSubmit={e => { e.preventDefault(); loadPackages(1); }} className="relative">
            <label className="sr-only" htmlFor="package-search">Pakete suchen</label><Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
            <input id="package-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Fragensammlungen, Themen oder Schlagwörter suchen" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-28 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
            <button type="submit" className="absolute bottom-2 right-2 top-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2">Suchen</button>
          </form>

          <div className="flex items-center justify-between text-sm text-slate-600"><span>{loading ? 'Pakete werden geladen …' : `${total} Fragenpaket${total === 1 ? '' : 'e'} gefunden`}</span>{total > 0 && <span>Seite {pagination.page} von {pagination.total_pages}</span>}</div>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button onClick={() => loadPackages(pagination.page)} className="ml-3 font-semibold underline">Erneut versuchen</button></div>}
          {loading ? <div className="space-y-4">{[1, 2, 3].map(n => <div key={n} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />)}</div> : !error && packages.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"><FileQuestion className="mx-auto mb-3 h-10 w-10 text-slate-400" /><h2 className="font-semibold text-slate-900">Keine passenden Pakete</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Passen Sie die Filter an oder veröffentlichen Sie eine eigene Fragensammlung.</p>{hasFilters ? <button onClick={resetFilters} className="mt-4 text-sm font-semibold text-red-700 hover:underline">Filter zurücksetzen</button> : <Link to="/upload" className="mt-4 inline-block text-sm font-semibold text-red-700 hover:underline">Paket veröffentlichen</Link>}</div> : <div className="space-y-4">
            {packages.map(pkg => <article key={pkg.id} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link to={`/packages/${pkg.id}`} className="text-lg font-bold text-slate-950 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-600">{pkg.title}</Link><p className="mt-1 text-sm text-slate-600">{pkg.author?.name}{pkg.author?.institution ? ` · ${pkg.author.institution}` : ''}</p></div><div className="flex flex-wrap gap-2 text-xs">{pkg.visibility === 'private' ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-900">Privat · Freigabe erforderlich</span> : <><span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono font-semibold text-slate-700">v{pkg.latest_version}</span>{pkg.license && <LicenseBadge license={pkg.license} className="rounded-full px-2.5 py-1" />}{pkg.forked_from_id && <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-800" title={`Fork von ${pkg.forked_from_id}`}><GitFork className="h-3.5 w-3.5" />Fork</span>}{pkg.preview_enabled !== false && <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-800">Vorschau</span>}</>}</div></div><p className="mt-3 text-sm leading-6 text-slate-700">{pkg.can_access === false ? 'Dieses Paket ist privat. In den Details können Sie Zugriff anfragen.' : pkg.summary}</p><div className="mt-4 flex flex-wrap gap-2 text-xs">{pkg.taxonomy?.subject && <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 font-medium text-red-800"><BookOpen className="h-3.5 w-3.5" />{pkg.taxonomy.subject}</span>}{pkg.taxonomy?.subject_category && <span className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{pkg.taxonomy.subject_category}</span>}{pkg.taxonomy?.grades?.map((grade: string) => <span key={grade} className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{grade}</span>)}</div>{pkg.can_access !== false && <div className="mt-3"><QuestionTypeBadges breakdown={pkg.stats?.qtypes_breakdown} max={4} /></div>}<footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm"><span className="flex items-center gap-1.5 text-slate-600">{pkg.can_access === false ? 'Begrenzte Angaben' : <><Layers className="h-4 w-4" />{pkg.stats?.question_count || 0} Fragen</>}</span><div className="flex gap-2">{pkg.visibility !== 'private' && <a href={`/api/v1/packages/${pkg.id}/releases/${pkg.latest_version}/download`} download className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />XML</a>}<Link to={`/packages/${pkg.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Eye className="h-3.5 w-3.5" />Details</Link></div></footer></article>)}
          </div>}
          {total > pagination.limit && <nav aria-label="Seitennavigation" className="flex items-center justify-between border-t border-slate-200 pt-5"><button disabled={pagination.page <= 1} onClick={() => loadPackages(pagination.page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><ArrowLeft className="h-4 w-4" />Zurück</button><span className="text-sm text-slate-600">{pagination.page} / {pagination.total_pages}</span><button disabled={pagination.page >= pagination.total_pages} onClick={() => loadPackages(pagination.page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Weiter<ArrowRight className="h-4 w-4" /></button></nav>}
        </main>
      </div>
    </div>
  );
};
