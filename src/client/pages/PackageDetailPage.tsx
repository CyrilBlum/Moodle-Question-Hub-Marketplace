import React, { useRef, useState, useEffect } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Copy, Check, Eye, Layers, ShieldCheck, Calendar, BookOpen, ArrowLeft, ChevronDown, GitFork, Scale } from 'lucide-react';
import { api, getToken } from '../api/client';
import { PackageSettings } from '../components/PackageSettings';
import { AccessRequests } from '../components/AccessRequests';
import { PackageMembers } from '../components/PackageMembers';
import { QuestionTypeBadges } from '../components/QuestionTypeBadges';
import { sanitizeQuestionHtml } from '../utils/sanitize';
import { buildCategoryTree, CategoryNode } from '../utils/categoryTree';
import { LicenseBadge, LICENSES } from '../components/License';
import { ForkDialog } from '../components/ForkDialog';
import { ForkPanel } from '../components/ForkPanel';
import { ForksList, MergeRequestList } from '../components/ForksAndMergeRequests';

const QuestionHtml: React.FC<{ html: string; className?: string }> = ({ html, className }) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;
    renderMathInElement(elementRef.current, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }, [html]);

  return <div ref={elementRef} className={className} dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(html) }} />;
};

const CategoryBranch: React.FC<{ nodes: CategoryNode[]; depth?: number }> = ({ nodes, depth = 0 }) => (
  <ul className={depth === 0 ? 'space-y-1' : 'mt-1 ml-5 pl-3 border-l-2 border-slate-200 space-y-1'}>
    {nodes.map(n => (
      <li key={n.name}>
        <div className="flex items-center space-x-2 text-slate-700">
          <Layers className={`w-4 h-4 shrink-0 ${n.children.length ? 'text-red-500' : 'text-slate-400'}`} />
          <span className={n.children.length ? 'font-semibold' : ''}>{n.name}</span>
          {n.children.length > 0 && (
            <span className="text-slate-400">({n.children.length})</span>
          )}
        </div>
        {n.children.length > 0 && <CategoryBranch nodes={n.children} depth={depth + 1} />}
      </li>
    ))}
  </ul>
);

export const PackageDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pkg, setPkg] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?tab=anfragen / ?tab=mitwirkende are the links in the access request and membership e-mails.
  const initialTab = ({ anfragen: 'requests', mitwirkende: 'members', merge: 'merge', forks: 'forks' } as const)[searchParams.get('tab') as 'anfragen'] || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'preview' | 'versions' | 'members' | 'requests' | 'settings' | 'forks' | 'merge'>(initialTab);
  const [showFork, setShowFork] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [accessRequestMessage, setAccessRequestMessage] = useState('');
  const [accessNote, setAccessNote] = useState('');
  const [shareContact, setShareContact] = useState(true);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);

  useEffect(() => {
    if (['anfragen', 'mitwirkende'].includes(searchParams.get('tab') || '') && !getToken()) {
      navigate(`/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
      return;
    }
    if (id) {
      loadData(id);
    }
  }, [id]);

  // Package admins and Hub admins manage the package; anyone with a role sees the members.
  const canManage = !!getToken() && !!pkg?.can_manage;
  const hasRole = !!getToken() && (!!pkg?.my_role || canManage);

  const loadAccessRequests = async (packageId: string) => {
    try {
      const result = await api.getPackageAccessRequests(packageId);
      setAccessRequests(result.data || []);
    } catch {
      setAccessRequests([]);
    }
  };

  useEffect(() => {
    if (canManage && pkg?.id) loadAccessRequests(pkg.id);
    // Someone without the rights following an e-mail link lands on the overview.
    if (pkg?.id && ((activeTab === 'requests' && !canManage) || (activeTab === 'members' && !hasRole))) setActiveTab('overview');
  }, [canManage, hasRole, pkg?.id]);

  const loadData = async (packageId: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await api.getPackage(packageId);
      setPkg(data);
      // Load preview (only if the author enabled it)
      if (data.preview_enabled !== false && data.can_access !== false) {
        const prevData = await api.getPackagePreview(packageId);
        setPreview(prevData);
      }
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

  const requestAccess = async () => {
    try {
      const result = await api.requestPackageAccess(pkg.id, { message: accessNote.trim() || undefined, share_contact: shareContact });
      setAccessRequestMessage(result.notification_sent === false
        ? 'Die Anfrage wurde gespeichert, aber die E-Mail an die Eigentümerschaft konnte nicht zugestellt werden.'
        : result.status === 'approved' ? 'Sie haben bereits Zugriff.' : 'Anfrage gesendet. Die Eigentümerschaft wurde per E-Mail benachrichtigt.');
      if (result.status === 'approved') loadData(pkg.id, true);
      else setPkg((current: any) => ({ ...current, access_status: 'pending' }));
    } catch (err: any) {
      setAccessRequestMessage(err.message || 'Die Anfrage konnte nicht gesendet werden.');
    }
  };

  const downloadXml = async (version: string = pkg.latest_version) => {
    setShowVersions(false);
    try {
      const blob = await api.downloadPackage(pkg.id, version);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `package-${pkg.id}-${version}.xml`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setAccessRequestMessage(err.message || 'Download fehlgeschlagen.');
    }
  };

  const pendingRequests = accessRequests.filter(r => r.status === 'pending').length;

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
                {pkg.can_access === false ? 'Privat' : `v${pkg.latest_version}`}
              </span>
              <LicenseBadge license={pkg.license} />
              {pkg.preview_enabled !== false && (
                <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded">
                  Vorschau
                </span>
              )}
              <span className="text-xs text-slate-400 font-mono">{pkg.id}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{pkg.title}</h1>
            {pkg.forked_from && (
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <GitFork className="w-4 h-4 text-violet-600" />Fork von{' '}
                {pkg.forked_from.exists && pkg.forked_from.title
                  ? <Link to={`/packages/${encodeURIComponent(pkg.forked_from.id)}`} className="text-red-700 hover:underline">«{pkg.forked_from.title}»</Link>
                  : <span className="font-mono">{pkg.forked_from.id}{pkg.forked_from.exists ? '' : ' (zurückgezogen)'}</span>}
                {pkg.forked_from.author_name && <span>von {pkg.forked_from.author_name}</span>}
                {pkg.forked_from.version && <span className="text-slate-400">· Basis v{pkg.forked_from.version}</span>}
              </p>
            )}
            <div className="text-sm text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-slate-800">{pkg.author?.name}</span>
              {pkg.author?.institution && <span>• {pkg.author.institution}</span>}
              {pkg.author?.canton && <span>• Kt. {pkg.author.canton}</span>}
              <span>• Aktualisiert: {new Date(pkg.updated_at).toLocaleDateString('de-CH')}</span>
            </div>
          </div>

          {/* Action buttons */}
          {pkg.can_access !== false && <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
            <div className="relative inline-flex rounded-lg shadow-sm">
              <button
                onClick={() => downloadXml()}
                className={`inline-flex items-center space-x-2 px-4 py-2.5 bg-red-600 text-white font-medium hover:bg-red-700 transition text-sm ${
                  (pkg.releases?.length || 0) > 1 ? 'rounded-l-lg' : 'rounded-lg'}`}
              >
                <Download className="w-4 h-4" />
                <span>XML herunterladen</span>
              </button>
              {(pkg.releases?.length || 0) > 1 && (
                <button
                  onClick={() => setShowVersions(v => !v)}
                  aria-haspopup="menu"
                  aria-expanded={showVersions}
                  title="Frühere Version herunterladen"
                  className="px-2 py-2.5 rounded-r-lg bg-red-600 text-white hover:bg-red-700 border-l border-red-500"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span className="sr-only">Frühere Version herunterladen</span>
                </button>
              )}
              {showVersions && (
                <div role="menu" className="absolute right-0 top-full mt-1 z-20 min-w-[12rem] bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                  {pkg.releases.map((rel: any) => (
                    <button
                      key={rel.version}
                      role="menuitem"
                      onClick={() => downloadXml(rel.version)}
                      className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex justify-between gap-3"
                    >
                      <span className="font-mono">v{rel.version}{rel.version === pkg.latest_version ? ' (aktuell)' : ''}</span>
                      <span className="text-xs text-slate-400">{new Date(rel.created_at).toLocaleDateString('de-CH')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => getToken() ? setShowFork(true) : navigate(`/login?return_to=${encodeURIComponent(window.location.pathname)}`)}
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition text-sm shadow-sm"
              title="Eigene Kopie anlegen, bearbeiten und Änderungen per Änderungsvorschlag vorschlagen"
            >
              <GitFork className="w-4 h-4 text-slate-500" />
              <span>Eigene Kopie (Fork)</span>
            </button>
            <button
              onClick={copyImportUrl}
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition text-sm shadow-sm"
              title="Direkte Download-URL für Moodle-Plugin kopieren"
            >
              {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              <span>{copiedUrl ? 'Kopiert!' : 'Import-URL'}</span>
            </button>
          </div>}
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
        <nav className="flex gap-6 overflow-x-auto">
          {[
            { id: 'overview', label: 'Übersicht' },
            ...(pkg.can_access !== false ? [{ id: 'categories', label: `Kategorien (${pkg.categories?.length || 0})` }] : []),
            ...(pkg.can_access !== false && pkg.preview_enabled !== false
              ? [{ id: 'preview', label: `Vorschau (${pkg.stats?.question_count || 0})` }]
              : []),
            ...(pkg.can_access !== false ? [{ id: 'versions', label: `Versionen (${pkg.releases?.length || 0})` }] : []),
            ...(pkg.can_access !== false ? [{ id: 'merge', label: `Änderungsvorschläge${pkg.open_merge_requests_count ? ` (${pkg.open_merge_requests_count} offen)` : ''}` }] : []),
            ...(pkg.can_access !== false && pkg.forks_count ? [{ id: 'forks', label: `Forks (${pkg.forks_count})` }] : []),
            ...(hasRole ? [{ id: 'members', label: 'Mitwirkende' }] : []),
            ...(canManage && (pkg.visibility === 'private' || accessRequests.length > 0)
              ? [{ id: 'requests', label: `Zugriffsanfragen${pendingRequests ? ` (${pendingRequests} offen)` : ''}` }]
              : []),
            ...(canManage ? [{ id: 'settings', label: 'Einstellungen' }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition whitespace-nowrap ${
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

      {showFork && <ForkDialog pkg={pkg} onClose={() => setShowFork(false)} />}

      {/* Tab Contents */}
      {activeTab === 'overview' && pkg.forked_from && (pkg.my_role === 'admin' || pkg.my_role === 'editor') && (
        <ForkPanel pkg={pkg} onChanged={() => loadData(pkg.id, true)} />
      )}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">Beschreibung & Pädagogischer Kontext</h2>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{pkg.summary}</div>

            {pkg.can_access === false && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm text-amber-900">Dieses Paket ist privat. Beschreibung, Vorschau und XML werden erst nach einer Freigabe angezeigt.</p>
                {pkg.access_status === 'pending' ? (
                  <p className="text-sm font-medium text-amber-800">Ihre Zugriffsanfrage ist offen.</p>
                ) : getToken() ? (
                  <div className="space-y-2">
                    <label htmlFor="access-note" className="block text-xs font-medium text-amber-900">Nachricht an die Eigentümerschaft (optional)</label>
                    <textarea
                      id="access-note"
                      value={accessNote}
                      onChange={e => setAccessNote(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="z.B. wofür Sie die Fragen einsetzen möchten"
                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                    />
                    <label className="flex items-start gap-2 text-xs text-amber-900">
                      <input type="checkbox" checked={shareContact} onChange={e => setShareContact(e.target.checked)} className="mt-0.5" />
                      <span>Meine Kontaktdaten (E-Mail-Adresse und Schule) mitsenden. Ohne sie sieht die Eigentümerschaft nur Ihren Namen und kann Ihnen nur über den Hub antworten.</span>
                    </label>
                    <button onClick={requestAccess} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Zugriff anfragen</button>
                  </div>
                ) : (
                  <Link to={`/login?return_to=${encodeURIComponent(window.location.pathname)}`} className="inline-block px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Anmelden, um Zugriff anzufragen</Link>
                )}
                {accessRequestMessage && <p role="status" className="text-xs text-amber-900">{accessRequestMessage}</p>}
              </div>
            )}

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
            {pkg.can_access !== false && pkg.license && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Scale className="w-4 h-4 text-emerald-600" />Lizenz & Weiterverwendung</h3>
                <p className="text-xs text-slate-600">
                  {pkg.visibility === 'private' ? 'Dieses private Paket steht' : 'Dieses Paket ist offenes Bildungsmaterial (OER) und steht'} unter{' '}
                  {LICENSES[pkg.license]
                    ? <a href={LICENSES[pkg.license].url} target="_blank" rel="noopener noreferrer license" className="text-red-700 hover:underline">Creative Commons {LICENSES[pkg.license].short}</a>
                    : pkg.license}.
                  {pkg.license !== 'CC0-1.0' && ' Bei Weiterverwendung nennen Sie die Urheberschaft'}
                  {pkg.license === 'CC-BY-SA-4.0' && ' und geben Bearbeitungen unter derselben Lizenz weiter'}
                  {pkg.license !== 'CC0-1.0' && '.'}
                </p>
                {pkg.license !== 'CC0-1.0' && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                    Namensnennung: «{pkg.title}» von {pkg.author?.name}
                    {pkg.forked_from?.title ? `, Bearbeitung von «${pkg.forked_from.title}» von ${pkg.forked_from.author_name}` : ''},{' '}
                    {LICENSES[pkg.license]?.short || pkg.license}, {window.location.origin}/packages/{pkg.id}
                  </p>
                )}
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Fragetypen im Paket</h3>
              <QuestionTypeBadges breakdown={pkg.stats?.qtypes_breakdown} max={20} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Kompatibilität</span>
              </h3>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li>• Der Paketinhalt und die Fragetypen sind oben ausgewiesen.</li>
                <li>• Prüfen Sie vor dem Import, ob Ihre Moodle-Instanz die verwendeten Fragetypen unterstützt.</li>
                <li>• Paketautorinnen und -autoren können Voraussetzungen in der Beschreibung dokumentieren.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Kategorie-Hierarchie in Moodle</h2>
          <div className="text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
            <CategoryBranch nodes={buildCategoryTree(pkg.categories || [])} />
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <strong>Vorschau:</strong> Musterlösungen, Punkteanteile und automatisches Feedback sind in der Vorschau ausgeblendet.
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
                <QuestionHtml html={q.questiontextHtml} className="prose prose-sm max-w-none text-slate-800 text-sm" />

                {/* CodeRunner: the code the answer box starts with (plain text, rendered as text) */}
                {q.answerPreload && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Antwortvorlage:
                    </span>
                    <pre className="text-xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre">{q.answerPreload}</pre>
                  </div>
                )}

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
                          <div dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(opt.textHtml) }} />
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

      {activeTab === 'members' && hasRole && <PackageMembers packageId={pkg.id} />}

      {activeTab === 'merge' && pkg.can_access !== false && <MergeRequestList pkg={pkg} />}

      {activeTab === 'forks' && pkg.can_access !== false && <ForksList pkg={pkg} />}

      {activeTab === 'requests' && canManage && (
        <AccessRequests packageId={pkg.id} requests={accessRequests} onChanged={() => loadAccessRequests(pkg.id)} />
      )}

      {activeTab === 'settings' && canManage && (
        <PackageSettings key={`${pkg.updated_at}`} pkg={pkg} onChanged={() => loadData(pkg.id, true)} />
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
                  {rel.github_commit_url && (
                    <a href={rel.github_commit_url} target="_blank" rel="noopener noreferrer" className="text-xs text-red-600 hover:underline mt-1 inline-block">
                      Commit auf GitHub
                    </a>
                  )}
                  {rel.github_error && (
                    <p className="text-xs text-amber-700 mt-1">GitHub: {rel.github_error}</p>
                  )}
                  <div className="text-xs font-mono text-slate-400 mt-1 truncate max-w-md">
                    SHA-256: {rel.sha256}
                  </div>
                </div>

                {/* Same authenticated download as the button above, so private packages work too. */}
                <button
                  onClick={() => downloadXml(rel.version)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>v{rel.version} laden</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
