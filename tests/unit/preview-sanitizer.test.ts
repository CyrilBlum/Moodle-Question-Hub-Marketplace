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
});
