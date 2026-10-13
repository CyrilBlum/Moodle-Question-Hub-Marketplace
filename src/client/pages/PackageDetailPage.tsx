import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Copy, Check, Eye, Layers, ShieldCheck, Calendar, BookOpen, ArrowLeft } from 'lucide-react';
import { api } from '../api/client';

export const PackageDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pkg, setPkg] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'preview' | 'versions'>('overview');
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (packageId: string) => {
    setLoading(true);
    try {
      const data = await api.getPackage(packageId);
      setPkg(data);
      // Load preview
      const prevData = await api.getPackagePreview(packageId);
      setPreview(prevData);
    } catch (err) {
      console.error('Fehler beim Laden des Pakets:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyImportUrl = () => {
    if (!pkg) return;
    const url = `${window.location.origin}/api/v1/packages/${pkg.id}/releases/${pkg.latest_version}/download`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-24 bg-white rounded-xl border border-slate-200"></div>
          <div className="h-64 bg-white rounded-xl border border-slate-200"></div>
        </div>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-slate-900">Paket nicht gefunden</h2>
        <p className="text-sm text-slate-500 mt-2">Das angeforderte Fragenpaket existiert nicht.</p>
        <Link to="/" className="inline-block mt-4 text-red-600 hover:underline text-sm font-medium">
          Zurück zum Katalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back button */}
      <Link to="/" className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition">
        <ArrowLeft className="w-4 h-4" />
        <span>Zurück zum Katalog</span>
      </Link>

      {/* Header Banner Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                v{pkg.latest_version}
              </span>
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                {pkg.license}
              </span>
              <span className="text-xs text-slate-400 font-mono">{pkg.id}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{pkg.title}</h1>
            <div className="text-sm text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-slate-800">{pkg.author?.name}</span>
              {pkg.author?.institution && <span>• {pkg.author.institution}</span>}
              {pkg.author?.canton && <span>• Kt. {pkg.author.canton}</span>}
              <span>• Aktualisiert: {new Date(pkg.updated_at).toLocaleDateString('de-CH')}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
            <a
              href={`/api/v1/packages/${pkg.id}/releases/${pkg.latest_version}/download`}
              download
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-sm transition text-sm"
            >
              <Download className="w-4 h-4" />
              <span>XML herunterladen</span>
            </a>
            <button
              onClick={copyImportUrl}
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition text-sm shadow-sm"
              title="Direkte Download-URL für Moodle-Plugin kopieren"
            >
              {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              <span>{copiedUrl ? 'Kopiert!' : 'Import-URL'}</span>
            </button>
          </div>
        </div>

        {/* Taxonomy pills */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-slate-100">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
            <BookOpen className="w-3.5 h-3.5 mr-1" />
            {pkg.taxonomy?.subject}
          </span>
          {pkg.taxonomy?.subject_category && (
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
              Kursstufe: {pkg.taxonomy.subject_category}
            </span>
          )}
          {pkg.taxonomy?.grades?.map((g: string) => (
            <span key={g} className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
              {g}
            </span>
          ))}
          {pkg.taxonomy?.canton && (
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
              Kanton {pkg.taxonomy.canton}
            </span>
          )}
          {pkg.taxonomy?.topic && (
            <span className="px-2.5 py-1 rounded-md text-xs bg-slate-50 text-slate-600 border border-slate-200">
              Thema: {pkg.taxonomy.topic}
            </span>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Übersicht' },
            { id: 'categories', label: `Kategorien (${pkg.categories?.length || 0})` },
            { id: 'preview', label: `Sichere Vorschau (${pkg.stats?.question_count || 0})` },
            { id: 'versions', label: `Versionen (${pkg.releases?.length || 0})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === tab.id
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">Beschreibung & Pädagogischer Kontext</h2>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{pkg.summary}</div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Lehrplan-Referenzrahmen
              </h3>
              <p className="text-sm text-slate-700">
                {pkg.taxonomy?.framework || 'CH-EDK-RLP'} — Rahmenlehrplan für die gymnasialen Maturitätsschulen
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Fragentypen-Verteilung</h3>
              <div className="space-y-2">
                {pkg.stats?.qtypes_breakdown && Object.entries(pkg.stats.qtypes_breakdown).map(([type, count]: [string, any]) => (
                  <div key={type} className="flex justify-between items-center text-xs">
                    <span className="font-mono text-slate-600">{type}</span>
                    <span className="font-semibold text-slate-800 px-2 py-0.5 rounded bg-slate-100">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Kompatibilität</span>
              </h3>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li>• Moodle 4.5 LTS (Vollständig getestet)</li>
                <li>• Moodle 5.x Stable (Vollständig getestet)</li>
                <li>• Keine externen Plugin-Abhängigkeiten</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Kategorie-Hierarchie in Moodle</h2>
          <div className="space-y-2 font-mono text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
            {pkg.categories?.map((cat: string, i: number) => (
              <div key={i} className="flex items-center space-x-2 text-slate-700">
                <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{cat}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <strong>Pädagogisch geschützte Vorschau:</strong> Musterlösungen, Punkteanteile und automatisches Feedback werden
            aus Sicherheitsgründen serverseitig herausgefiltert, um Prüfungsintegrität zu gewährleisten.
          </div>

          <div className="space-y-4">
            {preview?.questions?.map((q: any, i: number) => (
              <div key={q.id || i} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-semibold text-sm text-slate-900">
                    Frage {i + 1}: {q.name}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {q.type}
                  </span>
                </div>

                {/* Question HTML with Base64 embedded images */}
                <div
                  className="prose prose-sm max-w-none text-slate-800 text-sm"
                  dangerouslySetInnerHTML={{ __html: q.questiontextHtml }}
                />

                {/* Answer choices if options exist */}
                {q.options && q.options.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Antwortoptionen:
                    </span>
                    <div className="space-y-1">
                      {q.options.map((opt: any) => (
                        <div
                          key={opt.id}
                          className="flex items-center space-x-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700"
                        >
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-400 shrink-0"></div>
                          <div dangerouslySetInnerHTML={{ __html: opt.textHtml }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'versions' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Veröffentlichungshistorie (SemVer)</h2>
          <div className="space-y-4">
            {pkg.releases?.map((rel: any) => (
              <div
                key={rel.version}
                className="border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-slate-900 font-mono">v{rel.version}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(rel.created_at).toLocaleDateString('de-CH')}
                    </span>
                    <span className="text-xs text-slate-500">({rel.question_count} Fragen)</span>
                  </div>
                  {rel.release_notes && (
                    <p className="text-xs text-slate-600 mt-1">{rel.release_notes}</p>
                  )}
                  <div className="text-xs font-mono text-slate-400 mt-1 truncate max-w-md">
                    SHA-256: {rel.sha256}
                  </div>
                </div>

                <a
                  href={`/api/v1/packages/${pkg.id}/releases/${rel.version}/download`}
                  download
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>v{rel.version} laden</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
