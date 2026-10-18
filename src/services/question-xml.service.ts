import crypto from 'crypto';

/**
 * Question-level view of a Moodle XML package: splitting into questions, three-way merges and line diffs.
 * Used by forks (sync with the original) and merge requests. Pure functions on strings, no XML DOM: the
 * question blocks are copied byte for byte, so a merge never reformats unchanged questions.
 */

export interface QuestionBlock {
  /** Stable identity across releases: category path + idnumber, else category path + type + name. */
  key: string;
  type: string;
  name: string;
  /** Category path without the $course$/top prefixes, '' before the first category. */
  category: string;
  raw: string;
  /** Whitespace between tags removed, for "same content" checks. */
  norm: string;
}

export interface ParsedPackage {
  questions: QuestionBlock[];
  /** Raw category block by normalised path (keeps info/idnumber of the category). */
  categories: Map<string, string>;
}

export type ChangeStatus = 'added' | 'removed' | 'modified';

export interface DiffRow { type: 'ctx' | 'del' | 'add'; text: string; old: number | null; new: number | null }
export interface DiffHunk { header: string; rows: DiffRow[] }

/** Lines longer than this (base64 images) are shortened to a hash in diffs. */
const MAX_LINE = 2000;
/** Above this many line pairs the LCS table gets too big; the changed middle is shown as replaced. */
const MAX_LCS_CELLS = 4_000_000;

/** Replaces the contents of CDATA sections and comments with spaces (same length), so tag searches skip them. */
function blankOpaque(xml: string): string {
  return xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, m => m.slice(0, 2) + ' '.repeat(m.length - 4) + m.slice(-2));
}

function decodeText(text: string): string {
  const cdata = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

/** "$course$/top/Informatik/K1" -> "Informatik/K1". */
export function normaliseCategory(path: string): string {
  let p = path.trim().replace(/^\$[a-z0-9]+\$\/?/i, '');
  p = p.replace(/^top(\/|$)/, '');
  return p.split('/').map(s => s.trim()).filter(Boolean).join('/');
}

/** First `<tag>…</tag>` directly searchable in the blanked block, returned from the raw block. */
function element(raw: string, blank: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(blank);
  if (!m) return null;
  const start = m.index + m[0].indexOf('>') + 1;
  return raw.slice(start, m.index + m[0].length - `</${tag}>`.length);
}

function textOf(raw: string, blank: string, tag: string): string {
  const inner = element(raw, blank, tag);
  if (inner === null) return '';
  const innerBlank = blankOpaque(inner);
  const text = element(inner, innerBlank, 'text');
  return decodeText(text ?? inner);
}

/** Splits a Moodle XML package into its top-level question blocks. */
export function parsePackage(xml: string): ParsedPackage {
  const blank = blankOpaque(xml);
  const questions: QuestionBlock[] = [];
  const categories = new Map<string, string>();
  const seen = new Map<string, number>();
  let category = '';
  const re = /<question(\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blank)) !== null) {
    const end = blank.indexOf('</question>', re.lastIndex);
    if (end < 0) break;
    const stop = end + '</question>'.length;
    const raw = xml.slice(m.index, stop);
    const rawBlank = blank.slice(m.index, stop);
    re.lastIndex = stop;
    const type = (/\btype="([^"]*)"/.exec(m[1] || '') || [])[1] || '';
    if (type === 'category') {
      category = normaliseCategory(textOf(raw, rawBlank, 'category'));
      if (!categories.has(category)) categories.set(category, raw);
      continue;
    }
    const name = textOf(raw, rawBlank, 'name');
    const idnumber = decodeText(element(raw, rawBlank, 'idnumber') ?? '');
    const identity = idnumber !== '' ? ['idnumber', idnumber] : ['name', type, name];
    const base = JSON.stringify([category, identity]);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    questions.push({
      key: crypto.createHash('sha256').update(n === 1 ? base : `${base}:${n}`).digest('hex').slice(0, 32),
      type, name, category, raw,
      norm: raw.replace(/>\s+</g, '><').trim(),
    });
  }
  return { questions, categories };
}

/** Builds a Moodle XML package from question blocks, writing a category block whenever the category changes. */
export function assemblePackage(questions: QuestionBlock[], categories: Map<string, string>): string {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<quiz>'];
  let current: string | null = null;
  for (const q of questions) {
    if (q.category !== current) {
      current = q.category;
      if (q.category !== '') {
        parts.push(categories.get(q.category)
          ?? `  <question type="category">\n    <category>\n      <text>$course$/top/${escapeXml(q.category)}</text>\n    </category>\n  </question>`);
      }
    }
    parts.push(q.raw);
  }
  parts.push('</quiz>', '');
  return parts.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface MergeEntry {
  key: string;
  name: string;
  type: string;
  category: string;
  /** What the source (fork) changed relative to the base. */
  source_status: ChangeStatus | null;
  /** What the target changed relative to the base. */
  target_status: ChangeStatus | null;
  conflict: boolean;
  base?: QuestionBlock;
  source?: QuestionBlock;
  target?: QuestionBlock;
}

function statusOf(base?: QuestionBlock, side?: QuestionBlock): ChangeStatus | null {
  if (!base && side) return 'added';
  if (base && !side) return 'removed';
  if (base && side && base.norm !== side.norm) return 'modified';
  return null;
}

/**
 * Compares source and target with their common base, question by question. An entry is listed when
 * the source or the target changed it; `conflict` when both changed it differently.
 */
export function compareThreeWay(base: ParsedPackage, source: ParsedPackage, target: ParsedPackage): MergeEntry[] {
  const b = new Map(base.questions.map(q => [q.key, q]));
  const s = new Map(source.questions.map(q => [q.key, q]));
  const t = new Map(target.questions.map(q => [q.key, q]));
  const order: string[] = [];
  const known = new Set<string>();
  for (const list of [source.questions, target.questions, base.questions]) {
    for (const q of list) if (!known.has(q.key)) { known.add(q.key); order.push(q.key); }
  }
  const entries: MergeEntry[] = [];
  for (const key of order) {
    const bq = b.get(key), sq = s.get(key), tq = t.get(key);
    const sourceStatus = statusOf(bq, sq);
    const targetStatus = statusOf(bq, tq);
    if (!sourceStatus && !targetStatus) continue;
    const sameResult = (sq?.norm ?? null) === (tq?.norm ?? null);
    const any = sq || tq || bq!;
    entries.push({
      key, name: any.name, type: any.type, category: any.category,
      source_status: sourceStatus, target_status: targetStatus,
      conflict: !!sourceStatus && !!targetStatus && !sameResult,
      base: bq, source: sq, target: tq,
    });
  }
  return entries;
}

export type Resolution = 'source' | 'target';

/**
 * Applies the source's changes to the target. Conflicts need a resolution per key; unresolved ones are
 * returned and nothing is merged. Unchanged and target-only questions keep the target's order; questions
 * the source added go after the last question of their category (or at the end).
 */
export function mergeThreeWay(
  base: ParsedPackage, source: ParsedPackage, target: ParsedPackage, resolutions: Record<string, Resolution> = {},
): { xml: string | null; unresolved: MergeEntry[]; entries: MergeEntry[]; changed: boolean } {
  const entries = compareThreeWay(base, source, target);
  const unresolved = entries.filter(e => e.conflict && resolutions[e.key] !== 'source' && resolutions[e.key] !== 'target');
  if (unresolved.length) return { xml: null, unresolved, entries, changed: false };

  // Result per key: the block to keep, or null to drop.
  const pick = new Map<string, QuestionBlock | null>();
  for (const e of entries) {
    if (!e.source_status) continue; // only the target changed: keep the target
    const useSource = !e.conflict || resolutions[e.key] === 'source';
    pick.set(e.key, useSource ? e.source ?? null : e.target ?? null);
  }
  const result: QuestionBlock[] = [];
  for (const q of target.questions) {
    if (!pick.has(q.key)) { result.push(q); continue; }
    const chosen = pick.get(q.key);
    if (chosen) result.push(chosen);
    pick.delete(q.key);
  }
  // What is left was added by the source (or removed in the target and kept by a resolution).
  for (const q of source.questions) {
    if (!pick.has(q.key)) continue;
    const chosen = pick.get(q.key);
    pick.delete(q.key);
    if (!chosen) continue;
    let at = -1;
    for (let i = result.length - 1; i >= 0; i--) if (result[i].category === chosen.category) { at = i; break; }
    if (at < 0) result.push(chosen); else result.splice(at + 1, 0, chosen);
  }
  // The target's category blocks win; categories only the source has come from the source.
  const categories = new Map([...base.categories, ...source.categories, ...target.categories]);
  const changed = result.length !== target.questions.length || result.some((q, i) => q.norm !== target.questions[i].norm);
  return { xml: assemblePackage(result, categories), unresolved: [], entries, changed };
}

/** Same questions with the same content (order ignored). */
export function sameContent(a: ParsedPackage, b: ParsedPackage): boolean {
  if (a.questions.length !== b.questions.length) return false;
  const m = new Map(a.questions.map(q => [q.key, q.norm]));
  return b.questions.every(q => m.get(q.key) === q.norm);
}

/** One XML element per line, indented, long lines shortened; for diffs only. */
export function displayLines(raw: string | undefined): string[] {
  if (!raw) return [];
  const blank = blankOpaque(raw);
  // Break between tags, but not inside CDATA or comments (blanked there).
  let out = '';
  let last = 0;
  const re = />\s*</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blank)) !== null) {
    out += raw.slice(last, m.index + 1) + '\n';
    last = m.index + m[0].length - 1;
  }
  out += raw.slice(last);
  const lines: string[] = [];
  let depth = 0;
  for (const line of out.split(/\r?\n/)) {
    const t = line.trim();
    if (t === '') continue;
    const closing = /^<\//.test(t);
    if (closing) depth = Math.max(0, depth - 1);
    let text = '  '.repeat(depth) + t;
    if (text.length > MAX_LINE) {
      text = `${text.slice(0, 80)} … [${text.length} Zeichen, ${crypto.createHash('sha1').update(text).digest('hex').slice(0, 8)}]`;
    }
    lines.push(text);
    const opens = /^<[a-zA-Z][^>]*[^/]>$|^<[a-zA-Z]>$/.test(t) && !/<\/[^>]+>$/.test(t);
    if (opens) depth++;
  }
  return lines;
}

/** Line diff (LCS), deletions before additions as in git. */
export function diffLines(oldLines: string[], newLines: string[]): DiffRow[] {
  let pre = 0;
  while (pre < oldLines.length && pre < newLines.length && oldLines[pre] === newLines[pre]) pre++;
  let suf = 0;
  while (suf < oldLines.length - pre && suf < newLines.length - pre &&
    oldLines[oldLines.length - 1 - suf] === newLines[newLines.length - 1 - suf]) suf++;
  const a = oldLines.slice(pre, oldLines.length - suf);
  const b = newLines.slice(pre, newLines.length - suf);
  const rows: DiffRow[] = [];
  for (let i = 0; i < pre; i++) rows.push({ type: 'ctx', text: oldLines[i], old: i + 1, new: i + 1 });
  const n = a.length, m = b.length;
  if (n * m > MAX_LCS_CELLS) {
    a.forEach((t, i) => rows.push({ type: 'del', text: t, old: pre + i + 1, new: null }));
    b.forEach((t, j) => rows.push({ type: 'add', text: t, old: null, new: pre + j + 1 }));
  } else {
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        rows.push({ type: 'ctx', text: a[i], old: pre + i + 1, new: pre + j + 1 }); i++; j++;
      } else if (i < n && (j === m || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
        rows.push({ type: 'del', text: a[i], old: pre + i + 1, new: null }); i++;
      } else {
        rows.push({ type: 'add', text: b[j], old: null, new: pre + j + 1 }); j++;
      }
    }
  }
  for (let k = 0; k < suf; k++) {
    const oi = oldLines.length - suf + k, ni = newLines.length - suf + k;
    rows.push({ type: 'ctx', text: oldLines[oi], old: oi + 1, new: ni + 1 });
  }
  return rows;
}

/** Groups diff rows into hunks with `context` unchanged lines around each change. */
export function hunks(rows: DiffRow[], context = 3): DiffHunk[] {
  if (rows.length === 0) return [];
  if (context >= rows.length) return [{ header: `@@ -${rows[0].old ?? 0} +${rows[0].new ?? 0} @@`, rows }];
  const changed = rows.map(r => r.type !== 'ctx');
  const keep = rows.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) if (changed[k]) return true;
    return false;
  });
  const result: DiffHunk[] = [];
  let current: DiffRow[] | null = null;
  rows.forEach((row, i) => {
    if (!keep[i]) { current = null; return; }
    if (!current) {
      current = [];
      const first = row;
      result.push({ header: `@@ -${first.old ?? '?'} +${first.new ?? '?'} @@`, rows: current });
    }
    current.push(row);
  });
  return result;
}

/** Diff between two question blocks as hunks (whole question when one side is missing). */
export function questionDiff(oldBlock?: QuestionBlock, newBlock?: QuestionBlock): DiffHunk[] {
  const rows = diffLines(displayLines(oldBlock?.raw), displayLines(newBlock?.raw));
  return hunks(rows, oldBlock && newBlock ? 3 : rows.length);
}
