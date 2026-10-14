import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PreviewSanitizerService } from '../../src/services/preview-sanitizer.service';

describe('PreviewSanitizerService Unit Tests', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');

  it('sanitizes Moodle XML package and completely strips answers, fractions, and feedback', () => {
    const xml = fs.readFileSync(path.join(fixturesDir, 'valid-gym-datenstrukturen.xml'), 'utf-8');
    const preview = PreviewSanitizerService.sanitizeXmlToPreview(
      'ch.gym.inf.datenstrukturen',
      '1.0.0',
      'Datenstrukturen',
      xml
    );

    expect(preview.packageId).toBe('ch.gym.inf.datenstrukturen');
    expect(preview.questions.length).toBeGreaterThan(0);

    const jsonString = JSON.stringify(preview);

    // Assert that no fractions or feedback leaks exist in the entire JSON output
    expect(jsonString).not.toContain('fraction="100"');
    expect(jsonString).not.toContain('"fraction"');
    expect(jsonString).not.toContain('Korrekt!');
    expect(jsonString).not.toContain('Falsch, das wäre Preorder');

    // Questions should still have prompts
    const mcQuestion = preview.questions.find(q => q.type === 'multichoice');
    expect(mcQuestion).toBeDefined();
    expect(mcQuestion?.options).toBeDefined();
    expect(mcQuestion?.options?.length).toBe(3);
  });

  describe('Cloze Subquestion Sanitization Tests', () => {
    const CANARY_SECRETS = {
      SA_STANDARD: 'SECRET_SA_STD_1111',
      MC_STANDARD: 'SECRET_MC_STD_2222',
      NM_STANDARD: 'SECRET_NM_STD_3333',
      SA_SHORT: 'SECRET_SA_SHORT_4444',
      MC_SHORT: 'SECRET_MC_SHORT_5555',
      NM_SHORT: 'SECRET_NM_SHORT_6666',
      MC_VERTICAL: 'SECRET_MCV_7777',
      SA_LOWERCASE: 'SECRET_LOWERCASE_8888',
      MC_OMITTED_WEIGHT: 'SECRET_OMITTED_WEIGHT_9999',
      SA_WHITESPACE: 'SECRET_SPACES_1010',
      SA_ESCAPED_BRACE: 'SECRET_ESC_BRACE_2020',
      MR_CHECKBOXES: 'SECRET_MR_3030',
      MULTILINE: 'SECRET_MULTILINE_4040',
      NESTED_BRACES: 'SECRET_NESTED_5050',
      BACK_TO_BACK_1: 'SECRET_B2B_ONE',
      BACK_TO_BACK_2: 'SECRET_B2B_TWO',
      TOLERANCE_VAL: 'SECRET_TOLERANCE_7070',
    };

    const makeClozeXml = (questionText: string, typeName = 'cloze') => `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="${typeName}">
    <name><text>Cloze Testfrage</text></name>
    <questiontext format="html">
      <text><![CDATA[${questionText}]]></text>
    </questiontext>
  </question>
</quiz>`;

    it('sanitizes all standard Cloze types (SHORTANSWER, MULTICHOICE, NUMERICAL)', () => {
      const qText = `<p>Test: {1:SHORTANSWER:=${CANARY_SECRETS.SA_STANDARD}#Correct} and {1:MULTICHOICE:Wrong~=${CANARY_SECRETS.MC_STANDARD}} and {1:NUMERICAL:=${CANARY_SECRETS.NM_STANDARD}:0.1}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));
      const html = preview.questions[0].questiontextHtml;

      expect(html).toContain('<p>Test: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.SA_STANDARD);
      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.MC_STANDARD);
      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.NM_STANDARD);
    });

    it('sanitizes short-code subquestions (SA, MC, NM, MR)', () => {
      const qText = `<p>SA: {1:SA:=${CANARY_SECRETS.SA_SHORT}} MC: {1:MC:W~=${CANARY_SECRETS.MC_SHORT}} NM: {1:NM:=${CANARY_SECRETS.NM_SHORT}:0} MR: {1:MR:%50%A~%50%${CANARY_SECRETS.MR_CHECKBOXES}}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));
      const json = JSON.stringify(preview);

      expect(json).not.toContain(CANARY_SECRETS.SA_SHORT);
      expect(json).not.toContain(CANARY_SECRETS.MC_SHORT);
      expect(json).not.toContain(CANARY_SECRETS.NM_SHORT);
      expect(json).not.toContain(CANARY_SECRETS.MR_CHECKBOXES);
      expect(preview.questions[0].questiontextHtml).toBe('<p>SA: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> MC: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> NM: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> MR: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes layout variations (MULTICHOICE_V, MCV, MULTICHOICE_H, MCS, MULTIRESPONSE_H)', () => {
      const qText = `<p>{1:MULTICHOICE_V:W~=${CANARY_SECRETS.MC_VERTICAL}} and {1:MCS:W~=B} and {1:MULTIRESPONSE_H:%50%A~%50%B}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.MC_VERTICAL);
      expect(preview.questions[0].questiontextHtml).toBe('<p><span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes case-insensitive type declarations (lowercase & mixed-case)', () => {
      const qText = `<p>{1:shortanswer:=${CANARY_SECRETS.SA_LOWERCASE}} and {1:multichoice:A~=B} and {1:Numerical:=42}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.SA_LOWERCASE);
      expect(preview.questions[0].questiontextHtml).toBe('<p><span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes Cloze items with omitted weights ({:MC:...})', () => {
      const qText = `<p>Omitted: {:MC:Wrong~=${CANARY_SECRETS.MC_OMITTED_WEIGHT}} and {:SA:=Answer}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.MC_OMITTED_WEIGHT);
      expect(preview.questions[0].questiontextHtml).toBe('<p>Omitted: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes Cloze items with arbitrary whitespace ({ 2 : SA : ... })', () => {
      const qText = `<p>Spaces: { 2 : SA : =${CANARY_SECRETS.SA_WHITESPACE} } and { : NM : =42 }</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.SA_WHITESPACE);
      expect(preview.questions[0].questiontextHtml).toBe('<p>Spaces: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span> and <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes Cloze items containing escaped closing braces (\\}) without leaking remainder', () => {
      const qText = `<p>Escaped: {1:SA:=x \\} y#Feedback with \\} brace ${CANARY_SECRETS.SA_ESCAPED_BRACE}}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.SA_ESCAPED_BRACE);
      expect(preview.questions[0].questiontextHtml).toBe('<p>Escaped: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes multiline Cloze subquestions across CRLF and LF', () => {
      const qText = `<p>Multiline:\n{\n  1:\n  MULTICHOICE:\n  ~Falsch\n  ~=${CANARY_SECRETS.MULTILINE}\n}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.MULTILINE);
      expect(preview.questions[0].questiontextHtml).toBe('<p>Multiline:\n<span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('preserves surrounding LaTeX formulas containing curly braces', () => {
      const qText = `<p>Given \\( f(x) = \\frac{1}{x} \\) and set \\{1, 2\\}, calculate {1:SA:=Answer}.</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(preview.questions[0].questiontextHtml).toBe(
        '<p>Given \\( f(x) = \\frac{1}{x} \\) and set \\{1, 2\\}, calculate <span class="qh-cloze-gap" aria-label="Antwortlücke"></span>.</p>'
      );
    });

    it('handles nested curly braces safely without syntax wreckage', () => {
      const qText = `<p>Nested: {1:SA:=\\text{${CANARY_SECRETS.NESTED_BRACES}}}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.NESTED_BRACES);
      expect(preview.questions[0].questiontextHtml).toBe('<p>Nested: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('supports question type "multianswer" as well as "cloze"', () => {
      const qText = `<p>Native Moodle type: {1:SA:=Secret}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText, 'multianswer'));

      expect(preview.questions[0].questiontextHtml).toBe('<p>Native Moodle type: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes back-to-back Cloze items without delimiter collisions', () => {
      const qText = `<p>{1:SA:=${CANARY_SECRETS.BACK_TO_BACK_1}}{1:MC:=${CANARY_SECRETS.BACK_TO_BACK_2}}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.BACK_TO_BACK_1);
      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.BACK_TO_BACK_2);
      expect(preview.questions[0].questiontextHtml).toBe('<p><span class="qh-cloze-gap" aria-label="Antwortlücke"></span><span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes numerical questions with tolerances and negative credits', () => {
      const qText = `<p>Toleranz: {1:NM:=${CANARY_SECRETS.TOLERANCE_VAL}:0.05~%-50%100:0.1}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain(CANARY_SECRETS.TOLERANCE_VAL);
      expect(preview.questions[0].questiontextHtml).toBe('<p>Toleranz: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });

    it('sanitizes Cloze items with complex per-answer feedback tokens', () => {
      const qText = `<p>Feedback: {1:MC:=Richtig#Super gemacht!~Falsch#Leider daneben\\#nochmal versuchen}</p>`;
      const preview = PreviewSanitizerService.sanitizeXmlToPreview('pkg', '1.0.0', 'T', makeClozeXml(qText));

      expect(JSON.stringify(preview)).not.toContain('Super gemacht!');
      expect(JSON.stringify(preview)).not.toContain('Leider daneben');
      expect(preview.questions[0].questiontextHtml).toBe('<p>Feedback: <span class="qh-cloze-gap" aria-label="Antwortlücke"></span></p>');
    });
  });

  describe('XSS Defense & HTML Sanitization Tests', () => {
    it('strips executable <script> tags and script payloads from question text', () => {
      const maliciousXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>XSS Test Script</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Erklaere Rekursion.<script>alert("XSS")</script></p>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.xss', '1.0.0', 'XSS Test', maliciousXml);
      const q = preview.questions[0];

      expect(q.questiontextHtml).toContain('<p>Erklaere Rekursion.</p>');
      expect(q.questiontextHtml).not.toContain('<script');
      expect(q.questiontextHtml).not.toContain('alert("XSS")');
    });

    it('strips dangerous event handlers (onerror, onload, onclick) from elements', () => {
      const maliciousXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>XSS Test Event Handlers</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Bild: <img src="x" onerror="alert('XSS')" /><svg onload="alert('SVG_XSS')"><circle r="5"/></svg></p>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.xss', '1.0.0', 'XSS Test', maliciousXml);
      const html = preview.questions[0].questiontextHtml;

      expect(html).not.toContain('onerror');
      expect(html).not.toContain('onload');
      expect(html).not.toContain('alert');
      expect(html).toContain('<img src="x">');
      expect(html).toContain('<circle r="5">');
    });

    it('strips javascript: and data:text/html pseudo-protocols from anchor links', () => {
      const maliciousXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>XSS Test Links</text></name>
    <questiontext format="html">
      <text><![CDATA[<p><a href="javascript:alert('XSS')">Klick mich</a> und <a href="data:text/html,<script>alert(1)</script>">Data Link</a></p>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.xss', '1.0.0', 'XSS Test', maliciousXml);
      const html = preview.questions[0].questiontextHtml;

      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('data:text/html');
      expect(html).toContain('<a>Klick mich</a>');
      expect(html).toContain('<a>Data Link</a>');
    });

    it('preserves legitimate Base64 embedded image data URIs', () => {
      const safeImageXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>Safe Image Test</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Baumdiagramm: <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=" alt="Graph" /></p>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.safe', '1.0.0', 'Safe Test', safeImageXml);
      const html = preview.questions[0].questiontextHtml;

      expect(html).toContain('src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII="');
      expect(html).toContain('alt="Graph"');
    });

    it('preserves native MathML elements and annotations', () => {
      const mathmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>MathML Test</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Formel: <math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><mi>x</mi><mo>=</mo><mfrac><mrow><mo>−</mo><mi>b</mi></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></mrow><annotation encoding="application/x-tex">x = \\frac{-b}{2a}</annotation></semantics></math></p>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.math', '1.0.0', 'Math Test', mathmlXml);
      const html = preview.questions[0].questiontextHtml;

      expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
      expect(html).toContain('<semantics>');
      expect(html).toContain('<mfrac>');
      expect(html).toContain('<annotation encoding="application/x-tex">');
    });

    it('preserves KaTeX HTML structure, classes, and layout styles', () => {
      const katexXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>KaTeX Test</text></name>
    <questiontext format="html">
      <text><![CDATA[<p><span class="katex"><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:0.5em;"></span><span class="mord">42</span></span></span></span></p>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.katex', '1.0.0', 'KaTeX Test', katexXml);
      const html = preview.questions[0].questiontextHtml;

      expect(html).toContain('class="katex"');
      expect(html).toContain('class="katex-html"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('style="height:0.5em;"');
      expect(html).toContain('42');
    });

    it('preserves HTML tables, table headers, and lists', () => {
      const tableXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="description">
    <name><text>Table Test</text></name>
    <questiontext format="html">
      <text><![CDATA[<table><thead><tr><th>Spalte 1</th><th>Spalte 2</th></tr></thead><tbody><tr><td>Wert A</td><td>Wert B</td></tr></tbody></table><ul><li>Aufzaehlung 1</li><li>Aufzaehlung 2</li></ul>]]></text>
    </questiontext>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.table', '1.0.0', 'Table Test', tableXml);
      const html = preview.questions[0].questiontextHtml;

      expect(html).toContain('<table><thead><tr><th>Spalte 1</th>');
      expect(html).toContain('<tbody><tr><td>Wert A</td>');
      expect(html).toContain('<ul><li>Aufzaehlung 1</li>');
    });

    it('sanitizes malicious script and event handlers in multichoice answer options', () => {
      const mcXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoice">
    <name><text>MC XSS</text></name>
    <questiontext><text>Waehle:</text></questiontext>
    <answer fraction="100">
      <text><![CDATA[<p>Option 1<img src="x" onerror="alert('MC_XSS')" /></p>]]></text>
    </answer>
    <answer fraction="0">
      <text><![CDATA[<p>Option 2<script>alert('MC_SCRIPT')</script></p>]]></text>
    </answer>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.mc', '1.0.0', 'MC Test', mcXml);
      const options = preview.questions[0].options!;

      expect(options.length).toBe(2);
      expect(options[0].textHtml).not.toContain('onerror');
      expect(options[0].textHtml).toContain('<img src="x">');
      expect(options[1].textHtml).not.toContain('<script');
      expect(options[1].textHtml).toContain('<p>Option 2</p>');
    });

    it('sanitizes matching subquestions against script injection', () => {
      const matchingXml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="matching">
    <name><text>Matching XSS</text></name>
    <questiontext><text>Zuordnen:</text></questiontext>
    <subquestion>
      <text><![CDATA[<p>Begriff 1<script>alert('MATCH_XSS')</script></p>]]></text>
      <answer><text>Definition 1</text></answer>
    </subquestion>
  </question>
</quiz>`;

      const preview = PreviewSanitizerService.sanitizeXmlToPreview('test.matching', '1.0.0', 'Matching Test', matchingXml);
      const subq = preview.questions[0].subquestions![0];

      expect(subq.textHtml).not.toContain('<script');
      expect(subq.textHtml).toContain('<p>Begriff 1</p>');
    });
  });
});
