import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SafeXmlValidatorService } from '../../src/services/xml-validator.service';

describe('SafeXmlValidatorService Unit Tests', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');

  it('successfully validates a valid Moodle XML question package with all 7 question types', () => {
    const xml = fs.readFileSync(path.join(fixturesDir, 'valid-gym-datenstrukturen.xml'), 'utf-8');
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(true);
    expect(report.can_publish).toBe(true);
    expect(report.stats.question_count).toBe(7);
    expect(report.stats.categories_count).toBe(1);
    expect(report.diagnostics.errors).toHaveLength(0);
    expect(report.stats.qtypes_breakdown['multichoice']).toBe(1);
    expect(report.stats.qtypes_breakdown['truefalse']).toBe(1);
    expect(report.stats.qtypes_breakdown['shortanswer']).toBe(1);
    expect(report.stats.qtypes_breakdown['numerical']).toBe(1);
    expect(report.stats.qtypes_breakdown['matching']).toBe(1);
    expect(report.stats.qtypes_breakdown['multianswer']).toBe(1);
    expect(report.stats.qtypes_breakdown['essay']).toBe(1);
  });

  it('strictly blocks XXE injection payload with DOCTYPE declaration', () => {
    const xml = fs.readFileSync(path.join(fixturesDir, 'attack-xxe-passwd.xml'), 'utf-8');
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(false);
    expect(report.can_publish).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_XXE_DOCTYPE_FORBIDDEN')).toBe(true);
  });

  it('strictly blocks Billion Laughs exponential entity expansion attack', () => {
    const xml = fs.readFileSync(path.join(fixturesDir, 'attack-billion-laughs.xml'), 'utf-8');
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(false);
    expect(report.can_publish).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_XXE_DOCTYPE_FORBIDDEN')).toBe(true);
  });

  it('strictly blocks standalone ENTITY declarations', () => {
    const xml = '<!ENTITY xxe SYSTEM "file:///dev/random"><quiz></quiz>';
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_XXE_ENTITY_FORBIDDEN')).toBe(true);
  });

  it('strictly blocks XInclude directives', () => {
    const xml = '<quiz xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/hosts"/></quiz>';
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_XXE_XINCLUDE_FORBIDDEN')).toBe(true);
  });

  it('strictly blocks xml-stylesheet processing instructions', () => {
    const xml = '<?xml-stylesheet type="text/xsl" href="evil.xsl"?><quiz></quiz>';
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_XXE_STYLESHEET_FORBIDDEN')).toBe(true);
  });

  it('permits legitimate informatic questions with DOCTYPE inside CDATA sections', () => {
    const xml = fs.readFileSync(path.join(fixturesDir, 'legitimate-cdata.xml'), 'utf-8');
    const report = SafeXmlValidatorService.validatePackage(xml);

    expect(report.valid).toBe(true);
    expect(report.can_publish).toBe(true);
    expect(report.diagnostics.errors).toHaveLength(0);
    expect(report.stats.question_count).toBe(1);
  });

  it('detects single-choice question with zero 100% choices and flags ERR_SINGLE_CHOICE_NO_100', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoice">
    <name><text>No 100 Test</text></name>
    <questiontext><text>Prompt</text></questiontext>
    <single>true</single>
    <answer fraction="50"><text>A</text></answer>
    <answer fraction="0"><text>B</text></answer>
  </question>
</quiz>`;
    const report = SafeXmlValidatorService.validatePackage(xml);
    expect(report.valid).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_SINGLE_CHOICE_NO_100')).toBe(true);
  });

  it('detects single-choice question with multiple 100% choices and flags ERR_SINGLE_CHOICE_MULTIPLE_100', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoice">
    <name><text>Multiple 100 Test</text></name>
    <questiontext><text>Prompt</text></questiontext>
    <single>true</single>
    <answer fraction="100"><text>A</text></answer>
    <answer fraction="100"><text>B</text></answer>
  </question>
</quiz>`;
    const report = SafeXmlValidatorService.validatePackage(xml);
    expect(report.valid).toBe(false);
    expect(report.diagnostics.errors.some(e => e.code === 'ERR_SINGLE_CHOICE_MULTIPLE_100')).toBe(true);
  });

  it('detects off-step fractions and computes nearest canonical fraction', () => {
    const step73 = SafeXmlValidatorService.findNearestFraction(73);
    expect(step73.isExact).toBe(false);
    expect(step73.nearest).toBe(75);

    const step33 = SafeXmlValidatorService.findNearestFraction(33);
    expect(step33.isExact).toBe(false);
    expect(step33.nearest).toBe(33.33333);

    const step100 = SafeXmlValidatorService.findNearestFraction(100);
    expect(step100.isExact).toBe(true);
    expect(step100.nearest).toBe(100);
  });

  it('validates embedded media file MIME magic bytes and rejects dangerous executables', () => {
    // Valid PNG base64 header: \x89PNG\r\n\x1a\n
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const pngResult = SafeXmlValidatorService.validateMediaFile('diagram.png', pngBase64);
    expect(pngResult.valid).toBe(true);
    expect(pngResult.mime).toBe('image/png');

    // Executable disguised as png (MZ header)
    const mzBase64 = Buffer.from('MZThisIsAnExecutable').toString('base64');
    const exeResult = SafeXmlValidatorService.validateMediaFile('malicious.png', mzBase64);
    expect(exeResult.valid).toBe(false);
    expect(exeResult.error).toContain('ERR_DISALLOWED_MEDIA_MIME');

    // Disallowed extension
    const scriptResult = SafeXmlValidatorService.validateMediaFile('script.sh', 'c29tZXNjcmlwdA==');
    expect(scriptResult.valid).toBe(false);
    expect(scriptResult.error).toContain('ERR_DISALLOWED_MEDIA_MIME');
  });
});
