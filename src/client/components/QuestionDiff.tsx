import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, MessageSquare } from 'lucide-react';
import { plural } from '../utils/plural';
import { questionTypeLabel } from './QuestionTypeBadges';

export interface DiffRow { type: 'ctx' | 'del' | 'add'; text: string; old: number | null; new: number | null }
export interface DiffHunk { header: string; rows: DiffRow[] }
export interface QuestionChange {
  key: string;
  name: string;
  type: string;
  category: string;
  status: 'added' | 'removed' | 'modified';
  conflict: boolean;
  other_status: 'added' | 'removed' | 'modified' | null;
  hunks: DiffHunk[];
  other_hunks?: DiffHunk[];
  fields?: string[];
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', questiontext: 'Fragetext', answer: 'Antworten', generalfeedback: 'Allgemeines Feedback',
  correctfeedback: 'Feedback', partiallycorrectfeedback: 'Feedback', incorrectfeedback: 'Feedback',
  defaultgrade: 'Punkte', penalty: 'Abzug', hint: 'Hinweise', tags: 'Tags', idnumber: 'ID-Nummer',
  subquestion: 'Teilfragen', single: 'Antwortmodus', shuffleanswers: 'Reihenfolge', answernumbering: 'Nummerierung',
  testcases: 'Testfälle', answerpreload: 'Antwortvorlage', template: 'Vorlage', unitgradingtype: 'Einheiten', units: 'Einheiten',
};

/** "Fragetext, Antworten" for the changed parts of a question. */
function fieldSummary(fields: string[] = []): string {
  const labels = [...new Set(fields.map(f => FIELD_LABELS[f] || 'Weitere Einstellungen'))];
  return labels.join(', ');
}

const STATUS: Record<QuestionChange['status'], { label: string; cls: string }> = {
  added: { label: 'Neu', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  removed: { label: 'Entfernt', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  modified: { label: 'Geändert', cls: 'bg-amber-50 text-amber-900 border-amber-200' },
};

export const Hunks: React.FC<{ hunks: DiffHunk[] }> = ({ hunks }) => (
  <div className="overflow-x-auto text-xs font-mono">
    <table className="w-full border-collapse">
      <tbody>
        {hunks.map((h, i) => (
          <React.Fragment key={i}>
            {i > 0 && <tr><td className="text-slate-400 px-2 select-none">⋯</td></tr>}
            {h.rows.map((r, j) => (
              <tr key={j} className={r.type === 'add' ? 'bg-emerald-50' : r.type === 'del' ? 'bg-rose-50' : ''}>
                <td className={`whitespace-pre-wrap break-all pl-2 ${r.type === 'add' ? 'text-emerald-900' : r.type === 'del' ? 'text-rose-900' : 'text-slate-700'}`}>
                  <span className="select-none text-slate-400 mr-1">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>{r.text}
                </td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

export interface QuestionNote { id: string; body: string; author: { name: string }; created_at: string; resolved: boolean; question_key: string | null }

/**
 * Per-question changes with line diffs. Conflicts show the other side's change and, with `onResolve`,
 * a choice between the two versions. With `onComment`, each question can be discussed.
 */
export const QuestionDiffList: React.FC<{
  changes: QuestionChange[];
  sideLabel: string;
  otherLabel: string;
  resolutions?: Record<string, string>;
  /** Choices for a conflict, e.g. keep the original's or the fork's version. */
  resolveOptions?: Array<{ value: string; label: string }>;
  onResolve?: (key: string, value: string) => void;
  notes?: QuestionNote[];
  onComment?: (change: QuestionChange, body: string) => Promise<void>;
}> = ({ changes, sideLabel, otherLabel, resolutions, resolveOptions, onResolve, notes = [], onComment }) => {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(changes.map(c => [c.key, changes.length <= 5 || c.conflict])));
  // Conflicts need a decision: list them first.
  changes = [...changes].sort((a, b) => Number(b.conflict) - Number(a.conflict));
  const conflictCount = changes.filter(c => c.conflict).length;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (changes.length === 0) return <p className="text-sm text-slate-500">Keine Änderungen.</p>;
  const allOpen = changes.every(c => open[c.key]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span>{plural(changes.length, 'Frage', 'Fragen')}{conflictCount > 0 && ` · ${plural(conflictCount, 'Konflikt', 'Konflikte')}`}</span>
        <button type="button" onClick={() => setOpen(Object.fromEntries(changes.map(c => [c.key, !allOpen])))} className="text-red-700 hover:underline">
          {allOpen ? 'Alle zuklappen' : 'Alle aufklappen'}
        </button>
      </div>
      {conflictCount > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>{plural(conflictCount, 'Konflikt', 'Konflikte')}:</strong> Original und Variante haben dieselbe Frage unterschiedlich verändert.
          {onResolve ? ' Entscheiden Sie bei jeder markierten Frage, welche gilt.' : ' Wer übernimmt, entscheidet, welche Frage gilt.'}
        </p>
      )}
      {changes.map(c => {
        const own = notes.filter(n => n.question_key === c.key);
        return (
          <div key={c.key} id={`q-${c.key}`} className={`rounded-lg border ${c.conflict ? 'border-amber-400' : 'border-slate-200'} bg-white`}>
            <button type="button" onClick={() => setOpen(o => ({ ...o, [c.key]: !o[c.key] }))}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm" aria-expanded={!!open[c.key]}>
              {open[c.key] ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              <span className={`text-xs border rounded px-1.5 py-0.5 ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
              {c.conflict && <span className="inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 border-amber-300"><AlertTriangle className="w-3 h-3" />Konflikt</span>}
              <span className="font-medium text-slate-900">{c.name}</span>
              <span className="text-xs text-slate-500">{questionTypeLabel(c.type)}</span>
              {c.category && <span className="text-xs text-slate-500 truncate">· {c.category}</span>}
              {own.length > 0 && <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500"><MessageSquare className="w-3.5 h-3.5" />{own.length}</span>}
            </button>
            {open[c.key] && (
              <div className="border-t border-slate-100 p-3 space-y-3">
                {c.status === 'modified' && c.fields && c.fields.length > 0 && (
                  <p className="text-sm text-slate-700"><span className="text-slate-500">Geändert:</span> {fieldSummary(c.fields)}</p>
                )}
                <p className="text-xs text-slate-500">Moodle-XML der Frage: rot = entfernt, grün = neu.</p>
                {c.conflict ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div><p className="text-xs font-semibold text-slate-600 mb-1">{sideLabel}</p><Hunks hunks={c.hunks} /></div>
                    <div><p className="text-xs font-semibold text-slate-600 mb-1">{otherLabel}</p><Hunks hunks={c.other_hunks || []} /></div>
                  </div>
                ) : <Hunks hunks={c.hunks} />}
                {c.conflict && onResolve && resolveOptions && (
                  <fieldset className="flex flex-wrap gap-4 text-sm rounded bg-amber-50 border border-amber-200 p-2">
                    <legend className="sr-only">Welche Frage gilt?</legend>
                    <span className="text-amber-900 font-medium">Welche Frage gilt?</span>
                    {resolveOptions.map(o => (
                      <label key={o.value} className="inline-flex items-center gap-1.5">
                        <input type="radio" name={`res-${c.key}`} checked={resolutions?.[c.key] === o.value} onChange={() => onResolve(c.key, o.value)} />
                        {o.label}
                      </label>
                    ))}
                  </fieldset>
                )}
                {(own.length > 0 || onComment) && (
                  <div className="space-y-2 border-t border-slate-100 pt-2">
                    {own.map(n => (
                      <div key={n.id} className={`text-sm rounded p-2 ${n.resolved ? 'bg-slate-50 text-slate-500' : 'bg-sky-50'}`}>
                        <span className="font-medium">{n.author.name}</span>
                        <span className="text-xs text-slate-500 ml-2">{new Date(n.created_at).toLocaleString('de-CH')}{n.resolved ? ' · erledigt' : ''}</span>
                        <p className="whitespace-pre-line mt-0.5">{n.body}</p>
                      </div>
                    ))}
                    {onComment && (
                      <div className="flex gap-2">
                        <textarea rows={2} value={drafts[c.key] || ''} onChange={e => setDrafts(d => ({ ...d, [c.key]: e.target.value }))}
                          placeholder="Kommentar zu dieser Frage" aria-label={`Kommentar zu ${c.name}`}
                          className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                        <button type="button" disabled={!drafts[c.key]?.trim() || busy === c.key}
                          onClick={async () => {
                            setBusy(c.key);
                            try { await onComment(c, drafts[c.key]); setDrafts(d => ({ ...d, [c.key]: '' })); } finally { setBusy(null); }
                          }}
                          className="self-end px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium disabled:opacity-50">
                          Kommentieren
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
