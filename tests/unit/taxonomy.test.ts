import { describe, it, expect } from 'vitest';
import { TaxonomyService } from '../../src/services/taxonomy.service';

describe('TaxonomyService Unit Tests', () => {
  const service = TaxonomyService.getInstance();

  it('loads canonical Swiss Gymnasium curriculum taxonomy catalog', () => {
    const catalog = service.getCatalog();
    expect(catalog.framework).toBe('CH-EDK-RLP');
    expect(catalog.subjects.length).toBeGreaterThanOrEqual(15);
    expect(catalog.cantons.length).toBeGreaterThanOrEqual(21);
    expect(catalog.grade_levels).toHaveLength(4);
    expect(catalog.course_levels).toHaveLength(4);
  });

  it('contains Informatik with correct allowed course levels and default grades', () => {
    const inf = service.getSubjectByIdOrName('Informatik');
    expect(inf).toBeDefined();
    expect(inf?.code).toBe('INF');
    expect(inf?.allowed_course_levels).toContain('GF');
    expect(inf?.allowed_course_levels).toContain('SF');
    expect(inf?.allowed_course_levels).toContain('EF');
    expect(inf?.topics.length).toBeGreaterThanOrEqual(4);
  });

  it('validates valid curriculum classifications and rejects invalid course levels', () => {
    const valid = service.validateTaxonomy({
      subject: 'Informatik',
      level: 'SF',
      grades: ['GYM2', 'GYM3'],
      canton: 'ZH',
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalidLevel = service.validateTaxonomy({
      subject: 'Deutsch',
      level: 'SF', // Deutsch only has GF and FF in canonical MAR
    });
    expect(invalidLevel.valid).toBe(false);
    expect(invalidLevel.errors[0]).toContain('nicht zulässig');

    const invalidCanton = service.validateTaxonomy({
      canton: 'XX',
    });
    expect(invalidCanton.valid).toBe(false);
    expect(invalidCanton.errors[0]).toContain('Unbekannter Kanton');
  });
});
