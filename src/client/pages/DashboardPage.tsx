import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Key, Plus, Trash2, Copy, Check, AlertCircle, Shield, User } from 'lucide-react';
import { api, getToken, getStoredUser, setStoredUser } from '../api/client';
import { PackageEditForm } from '../components/PackageEditForm';
import { GitHubConnection } from '../components/GitHubConnection';
import { MyMergeRequests } from '../components/MyMergeRequests';
import { useEscapeKey } from '../utils/useEscapeKey';

export const CANTONS = [
  ['AG', 'Aargau'], ['AI', 'Appenzell Innerrhoden'], ['AR', 'Appenzell Ausserrhoden'],
  ['BE', 'Bern'], ['BL', 'Basel-Landschaft'], ['BS', 'Basel-Stadt'], ['FR', 'Freiburg'],
  ['GE', 'Genf'], ['GL', 'Glarus'], ['GR', 'Graubünden'], ['JU', 'Jura'], ['LU', 'Luzern'],
  ['NE', 'Neuenburg'], ['NW', 'Nidwalden'], ['OW', 'Obwalden'], ['SG', 'St. Gallen'],
  ['SH', 'Schaffhausen'], ['SO', 'Solothurn'], ['SZ', 'Schwyz'], ['TG', 'Thurgau'],
  ['TI', 'Tessin'], ['UR', 'Uri'], ['VD', 'Waadt'], ['VS', 'Wallis'], ['ZG', 'Zug'], ['ZH', 'Zürich'],
] as const;

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  // Deep links such as /dashboard#github (from the Moodle plugin) land on that section.
  const { hash } = useLocation();
  const [user, setUser] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [myPackages, setMyPackages] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // New Token Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(365);
  const [createdSecretToken, setCreatedSecretToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState<any>({});

  useEffect(() => {
    if (!getToken()) {
      navigate(`/login?return_to=${encodeURIComponent('/dashboard' + hash)}`);
      return;
    }
    const stored = getStoredUser();
    setUser(stored);
    setProfile(stored || {});
    loadTokens();
    loadMyPackages();
  }, []);

  useEffect(() => {
    // The target section renders after its own data loads; wait a moment before scrolling.
    if (!hash) return;
    const timer = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView(), 300);
    return () => clearTimeout(timer);
  }, [hash]);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const data = await api.getTokens();
      setTokens(data || []);
    } catch (err) {
      console.error('Fehler beim Laden der Tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const updated = await api.updateProfile(profile);
      setStoredUser(updated);
      setUser(updated);
      setProfile(updated);
      setEditingProfile(false);
    } catch (err: any) { setErrorMsg(err.message || 'Profil konnte nicht gespeichert werden.'); }
  };

  const loadMyPackages = async () => {
    try {
      const res = await api.getMyPackages();
      setMyPackages(res?.data || []);
    } catch (err) {
      console.error('Fehler beim Laden Ihrer Pakete:', err);
    }
  };

  const startEdit = (pkg: any) => {
    setEditing(pkg);
  };

  const handleWithdrawPackage = async (pkg: any) => {
    if (!confirm(`Paket «${pkg.title}» mit allen Versionen endgültig zurückziehen? Bereits in Moodle importierte Fragen bleiben dort erhalten.`)) {
      return;
    }
    try {
      await api.withdrawPackage(pkg.id);
      loadMyPackages();
    } catch (err: any) {
      setErrorMsg(err.message || 'Zurückziehen fehlgeschlagen.');
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) return;

    try {
      const res = await api.createToken(tokenName.trim(), expiresInDays > 0 ? expiresInDays : undefined);
      setCreatedSecretToken(res.token);
      loadTokens();
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Erstellen des Tokens.');
    }
  };

  const handleRevokeToken = async (id: string) => {
    if (!confirm('Möchten Sie diesen Token wirklich widerrufen? Das Moodle-Plugin verliert damit den Zugriff.')) {
      return;
    }
    try {
      await api.revokeToken(id);
      loadTokens();
    } catch (err) {
      console.error('Fehler beim Widerrufen:', err);
    }
  };

  const copyToClipboard = () => {
    if (!createdSecretToken) return;
    navigator.clipboard.writeText(createdSecretToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCreatedSecretToken(null);
    setTokenName('');
    setErrorMsg('');
  };
  useEscapeKey(!!editing, () => setEditing(null));
  // Not once the token is shown: it appears only once and must not vanish by an accidental Esc.
  useEscapeKey(modalOpen && !createdSecretToken, closeModal);


  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-lg">
            {user?.full_name?.charAt(0) || <User className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user?.full_name || 'Lehrperson'}</h1>
            <p className="text-xs text-slate-500">
              {user?.email} • {user?.institution} • Kt. {user?.canton}
            </p>
          </div>
        </div>
        <button onClick={() => setEditingProfile(!editingProfile)} className="px-3 py-1 border border-slate-300 rounded text-xs">Profil bearbeiten</button>
        </div>
        {editingProfile && <form onSubmit={saveProfile} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <input required value={profile.full_name || ''} onChange={e => setProfile({...profile, full_name: e.target.value})} placeholder="Name" className="border rounded p-2" />
          <input required type="email" value={profile.email || ''} onChange={e => setProfile({...profile, email: e.target.value})} placeholder="E-Mail" className="border rounded p-2" />
          <input required value={profile.institution || ''} onChange={e => setProfile({...profile, institution: e.target.value})} placeholder="Institution" className="border rounded p-2" />
          <select required value={profile.canton || ''} onChange={e => setProfile({...profile, canton: e.target.value})} className="border rounded p-2 bg-white">
            <option value="" disabled>Kanton wählen</option>
            {CANTONS.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
          </select>
          <input value={profile.profile_role || ''} onChange={e => setProfile({...profile, profile_role: e.target.value})} placeholder="Rolle, z. B. Lehrperson" className="border rounded p-2" />
          <input type="password" value={profile.password || ''} onChange={e => setProfile({...profile, password: e.target.value})} placeholder="Neues Passwort (optional)" className="border rounded p-2" />
          <div className="md:col-span-2"><button className="bg-red-600 text-white rounded px-3 py-2 text-xs">Profil speichern</button></div>
        </form>}
      </div>

      {/* My published packages */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Meine Pakete</h2>
        <p className="text-xs text-slate-500">Selbst veröffentlichte Pakete und Pakete, an denen Sie als Bearbeiter/in oder Admin mitwirken.</p>
        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
        {myPackages.length === 0 ? (
          <p className="text-xs text-slate-500">Noch keine Pakete.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {myPackages.map(pkg => (
              <div key={pkg.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <a href={`/packages/${pkg.id}`} className="font-semibold text-sm text-slate-900 hover:text-red-600">
                    {pkg.title}
                  </a>
                  <div className="text-xs text-slate-500 font-mono">
                    {pkg.id} • v{pkg.latest_version} • {pkg.downloads_count} Downloads •{' '}
                    {pkg.preview_enabled ? 'mit Vorschau' : 'ohne Vorschau'}
                    {!pkg.is_creator && <> • {pkg.my_role === 'admin' ? 'Admin' : 'Bearbeiter/in'}</>}
                    {pkg.forked_from_id && <> • Fork von {pkg.forked_from_id}</>}
                  </div>
                </div>
                {pkg.my_role === 'admin' && <div className="flex gap-2">
                <button
                  onClick={() => startEdit(pkg)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 sm:mr-2"
                >
                  Einstellungen
                </button>
                <button
                  onClick={() => handleWithdrawPackage(pkg)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                >
                  Paket zurückziehen
                </button>
                </div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <MyMergeRequests />

      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="package-edit-title" className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 id="package-edit-title" className="font-bold text-slate-900 mb-2">Paket-Einstellungen</h3>
            <p className="text-xs text-slate-500 font-mono">{editing.id}</p>
            <PackageEditForm
              pkg={editing}
              showHeading={false}
              onCancel={() => setEditing(null)}
              onSaved={async () => {
                setEditing(null);
                await loadMyPackages();
              }}
            />
          </div>
        </div>
      )}

      {/* PAT Management Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Key className="w-5 h-5 text-red-600" />
              <span>Personal Access Tokens (PAT)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Erlaubt Ihrem Moodle-Plugin (`qbank_questionhub`) das direkte Veröffentlichen und Herunterladen von Fragensammlungen.
            </p>
          </div>
          <button
            onClick={() => {
              setCreatedSecretToken(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Neuen Token erstellen</span>
          </button>
        </div>

        {/* Tokens Table */}
        {loading ? (
          <div className="animate-pulse py-8 text-center text-xs text-slate-400">Lade Tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
            <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Noch keine aktiven Tokens erstellt.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead>
                <tr className="text-left font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Präfix</th>
                  <th className="py-2.5 px-3">Erstellt</th>
                  <th className="py-2.5 px-3">Zuletzt verwendet</th>
                  <th className="py-2.5 px-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {tokens.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-medium text-slate-900">{t.name}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{t.token_prefix}</td>
                    <td className="py-3 px-3">{new Date(t.created_at).toLocaleDateString('de-CH')}</td>
                    <td className="py-3 px-3">
                      {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString('de-CH') : 'Nie'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleRevokeToken(t.id)}
                        className="text-red-600 hover:text-red-800 font-medium inline-flex items-center space-x-1"
                        title="Token widerrufen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Widerrufen</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GitHubConnection />

      {/* New Token Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            {!createdSecretToken ? (
              <form onSubmit={handleCreateToken} className="space-y-4">
                <h3 className="text-base font-bold text-slate-900">Neuen Personal Access Token erstellen</h3>
                {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Token-Bezeichnung
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="z.B. Kanti Enge Moodle 4.5"
                    value={tokenName}
                    onChange={e => setTokenName(e.target.value)}
                    className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Gültigkeitsdauer
                  </label>
                  <select
                    value={expiresInDays}
                    onChange={e => setExpiresInDays(Number(e.target.value))}
                    className="w-full text-sm border-slate-300 rounded-lg p-2.5 bg-slate-50 border focus:bg-white"
                  >
                    <option value={30}>30 Tage</option>
                    <option value={90}>90 Tage</option>
                    <option value={365}>1 Jahr (365 Tage)</option>
                    <option value={0}>Unbegrenzt</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-2 pt-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 shadow-sm"
                  >
                    Token erzeugen
                  </button>
                </div>
              </form>
            ) : (
              /* One-Time Secret Reveal Modal */
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Wichtig:</strong> Kopieren Sie diesen Token jetzt. Aus Sicherheitsgründen wird das Klartext-Token nie wieder angezeigt!
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Ihr persönliches Zugriffs-Token
                  </label>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 break-all select-all">
                    {createdSecretToken}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 flex items-center justify-center space-x-1.5 transition"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'In die Zwischenablage kopiert!' : 'Token in die Zwischenablage kopieren'}</span>
                </button>

                <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                  <strong>Anleitung für Moodle:</strong>
                  <p>1. Öffnen Sie in Moodle: Website-Administration &gt; Plugins &gt; Fragekatalog &gt; Question Hub.</p>
                  <p>2. Fügen Sie diesen Token in das Feld «Marketplace Token» ein.</p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-5 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 shadow-sm"
                  >
                    Schliessen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
