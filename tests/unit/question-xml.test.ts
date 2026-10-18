import { describe, it, expect } from 'vitest';
import {
  parsePackage, mergeThreeWay, compareThreeWay, sameContent, displayLines, diffLines, questionDiff, normaliseCategory,
} from '../../src/services/question-xml.service';

const tf = (name: string, text: string, idnumber = '') =>
  `<question type="truefalse">\n  <name><text>${name}</text></name>\n  <questiontext format="html"><text><![CDATA[<p>${text}</p>]]></text></questiontext>\n` +
  `${idnumber ? `  <idnumber>${idnumber}</idnumber>\n` : ''}  <answer fraction="100"><text>true</text></answer>\n</question>`;
const cat = (path: string) => `<question type="category"><category><text>$course$/top/${path}</text></category></question>`;
const pkg = (...parts: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n${parts.join('\n')}\n</quiz>\n`;

describe('question-xml', () => {
  it('splits questions, skips CDATA and comments, normalises categories', () => {
    const p = parsePackage(pkg(
      '<!-- <question type="truefalse"> in a comment -->',
      cat('Informatik/K1'),
      tf('A', 'Text mit </question> im CDATA'),
      tf('B', 'b'),
      cat('Informatik/K2'),
      tf('A', 'gleicher Name, andere Kategorie'),
    ));
    expect(p.questions.map(q => [q.name, q.category])).toEqual([
      ['A', 'Informatik/K1'], ['B', 'Informatik/K1'], ['A', 'Informatik/K2'],
    ]);
    expect(new Set(p.questions.map(q => q.key)).size).toBe(3);
    expect(p.questions[0].raw).toContain('</question> im CDATA');
    expect(normaliseCategory('$system$/top/X/ Y ')).toBe('X/Y');
  });

  it('identifies a question by idnumber across renames, else by type and name', () => {
    const a = parsePackage(pkg(cat('K'), tf('Alt', 'x', 'q-1')));
    const b = parsePackage(pkg(cat('K'), tf('Neu', 'x', 'q-1')));
    expect(a.questions[0].key).toBe(b.questions[0].key);
    const c = parsePackage(pkg(cat('K'), tf('Alt', 'x')));
    const d = parsePackage(pkg(cat('K'), tf('Neu', 'x')));
    expect(c.questions[0].key).not.toBe(d.questions[0].key);
  });

  it('merges fork changes into a changed original and reports conflicts', () => {
    const base = parsePackage(pkg(cat('K'), tf('Q1', 'eins'), tf('Q2', 'zwei'), tf('Q3', 'drei')));
    // Fork: edits Q1, removes Q3, adds Q4.
    const fork = parsePackage(pkg(cat('K'), tf('Q1', 'eins (Fork)'), tf('Q2', 'zwei'), tf('Q4', 'vier')));
    // Original: edits Q2 and Q1 (differently).
    const original = parsePackage(pkg(cat('K'), tf('Q1', 'eins (Original)'), tf('Q2', 'zwei (Original)'), tf('Q3', 'drei')));

    const entries = compareThreeWay(base, fork, original);
    expect(entries.filter(e => e.conflict).map(e => e.name)).toEqual(['Q1']);
    expect(entries.filter(e => e.source_status).length).toBe(3);
    expect(entries.filter(e => e.target_status).length).toBe(2);

    const blocked = mergeThreeWay(base, fork, original);
    expect(blocked.xml).toBeNull();
    expect(blocked.unresolved.map(e => e.name)).toEqual(['Q1']);

    const q1 = entries.find(e => e.name === 'Q1')!.key;
    const merged = mergeThreeWay(base, fork, original, { [q1]: 'source' });
    const result = parsePackage(merged.xml!);
    expect(result.questions.map(q => q.name)).toEqual(['Q1', 'Q2', 'Q4']);
    expect(result.questions[0].raw).toContain('eins (Fork)');
    expect(result.questions[1].raw).toContain('zwei (Original)');
    expect(merged.changed).toBe(true);

    const keepOriginal = parsePackage(mergeThreeWay(base, fork, original, { [q1]: 'target' }).xml!);
    expect(keepOriginal.questions[0].raw).toContain('eins (Original)');
  });

  it('puts added questions after their category and keeps new categories', () => {
    const base = parsePackage(pkg(cat('A'), tf('A1', 'a'), cat('B'), tf('B1', 'b')));
    const fork = parsePackage(pkg(cat('A'), tf('A1', 'a'), tf('A2', 'neu'), cat('B'), tf('B1', 'b'), cat('C'), tf('C1', 'c')));
    const merged = parsePackage(mergeThreeWay(base, fork, base).xml!);
    expect(merged.questions.map(q => `${q.category}:${q.name}`)).toEqual(['A:A1', 'A:A2', 'B:B1', 'C:C1']);
    expect(merged.categories.has('C')).toBe(true);
  });

  it('treats identical changes on both sides as no conflict and detects unchanged merges', () => {
    const base = parsePackage(pkg(cat('K'), tf('Q1', 'x')));
    const both = parsePackage(pkg(cat('K'), tf('Q1', 'y')));
    expect(compareThreeWay(base, both, both).some(e => e.conflict)).toBe(false);
    const merged = mergeThreeWay(base, both, both);
    expect(merged.changed).toBe(false);
    expect(sameContent(parsePackage(merged.xml!), both)).toBe(true);
    // Whitespace between tags is not a change.
    const spaced = parsePackage(pkg(cat('K'), tf('Q1', 'y').replace(/\n/g, '\n\n   ')));
    expect(sameContent(spaced, both)).toBe(true);
  });

  it('shows line diffs with long lines shortened', () => {
    const lines = displayLines(tf('Q', 'x'));
    expect(lines[0]).toBe('<question type="truefalse">');
    expect(lines.some(l => l.startsWith('  <name>'))).toBe(true);
    const rows = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(rows.map(r => r.type)).toEqual(['ctx', 'del', 'add', 'ctx']);
    const big = displayLines(`<question type="essay"><questiontext><text>${'A'.repeat(5000)}</text></questiontext></question>`);
    expect(big.every(l => l.length < 200)).toBe(true);
    const added = questionDiff(undefined, parsePackage(pkg(tf('Q', 'x'))).questions[0]);
    expect(added).toHaveLength(1);
    expect(added[0].rows.every(r => r.type === 'add')).toBe(true);
  });
});
