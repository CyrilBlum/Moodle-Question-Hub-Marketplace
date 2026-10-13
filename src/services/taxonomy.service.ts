import fs from 'fs';
import path from 'path';
import { TaxonomyCatalog, Subject, Canton, GradeLevel, CourseLevel } from '../types/taxonomy.types';

export class TaxonomyService {
  private static instance: TaxonomyService | null = null;
  private catalog: TaxonomyCatalog;

  private constructor() {
    const candidates = [
      path.resolve(__dirname, '../taxonomy/taxonomy.seed.json'),
      path.resolve(__dirname, '../../src/taxonomy/taxonomy.seed.json'),
      path.resolve(process.cwd(), 'src/taxonomy/taxonomy.seed.json'),
      path.resolve(process.cwd(), 'dist/server/taxonomy/taxonomy.seed.json'),
    ];

    const foundPath = candidates.find(p => fs.existsSync(p));
    if (foundPath) {
      const raw = fs.readFileSync(foundPath, 'utf-8');
      this.catalog = JSON.parse(raw);
    } else {
      throw new Error(`Taxonomy seed file not found in any of: ${candidates.join(', ')}`);
    }
  }

  public static getInstance(): TaxonomyService {
    if (!TaxonomyService.instance) {
      TaxonomyService.instance = new TaxonomyService();
    }
    return TaxonomyService.instance;
  }

  public getCatalog(): TaxonomyCatalog {
    return this.catalog;
  }

  public getSubjects(): Subject[] {
    return this.catalog.subjects;
  }

  public getSubjectByIdOrName(query: string): Subject | undefined {
    const normalize = (str: string) =>
      str.trim().toLowerCase().replace(/&/g, 'und').replace(/\s+/g, ' ');
    const normalizedQuery = normalize(query);

    return this.catalog.subjects.find(s => {
      const sId = normalize(s.id);
      const sNameDe = normalize(s.name_de);
      const sCode = normalize(s.code);
      const sNameEn = normalize(s.name_en);
      return (
        sId === normalizedQuery ||
        sNameDe === normalizedQuery ||
        sCode === normalizedQuery ||
        sNameEn === normalizedQuery
      );
    });
  }

  public getCantons(): Canton[] {
    return this.catalog.cantons;
  }

  public getCantonByCode(code: string): Canton | undefined {
    const normalized = code.trim().toUpperCase();
    return this.catalog.cantons.find(c => c.code.toUpperCase() === normalized);
  }

  public getGradeLevels(): GradeLevel[] {
    return this.catalog.grade_levels;
  }

  public getCourseLevels(): CourseLevel[] {
    return this.catalog.course_levels;
  }

  public validateTaxonomy(tax: {
    subject?: string;
    level?: string;
    grades?: string[];
    canton?: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (tax.subject) {
      const subject = this.getSubjectByIdOrName(tax.subject);
      if (!subject) {
        errors.push(`Unbekanntes Fach: ${tax.subject}`);
      } else if (tax.level) {
        const lvl = tax.level.toUpperCase() as any;
        if (!subject.allowed_course_levels.includes(lvl)) {
          errors.push(`Kursstufe '${tax.level}' ist für Fach '${subject.name_de}' nicht zulässig.`);
        }
      }
    }

    if (tax.canton) {
      const canton = this.getCantonByCode(tax.canton);
      if (!canton) {
        errors.push(`Unbekannter Kanton: ${tax.canton}`);
      }
    }

    if (tax.grades && Array.isArray(tax.grades)) {
      const validGradeCodes = this.catalog.grade_levels.map(g => g.code);
      for (const grade of tax.grades) {
        if (!validGradeCodes.includes(grade as any)) {
          errors.push(`Ungültige Gymnasialstufe: ${grade}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
