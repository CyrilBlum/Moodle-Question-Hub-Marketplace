export interface GradeLevel {
  code: 'GYM1' | 'GYM2' | 'GYM3' | 'GYM4';
  school_year: number;
  harmos_year: number;
  label_de: string;
  label_en: string;
  description_de: string;
}

export interface CourseLevel {
  code: 'GF' | 'SF' | 'EF' | 'FF';
  name_de: string;
  name_en: string;
  description_de: string;
}

export interface Canton {
  code: string;
  name_de: string;
  curriculum_name: string;
}

export interface Topic {
  id: string;
  name_de: string;
  name_en: string;
  subtopics: string[];
}

export interface Subject {
  id: string;
  code: string;
  name_de: string;
  name_fr: string;
  name_en: string;
  allowed_course_levels: Array<'GF' | 'SF' | 'EF' | 'FF'>;
  default_grades: Array<'GYM1' | 'GYM2' | 'GYM3' | 'GYM4'>;
  topics: Topic[];
}

export interface TaxonomyCatalog {
  version: string;
  framework: 'CH-EDK-RLP';
  description?: string;
  grade_levels: GradeLevel[];
  course_levels: CourseLevel[];
  cantons: Canton[];
  subjects: Subject[];
  licenses?: Array<{
    code: string;
    name: string;
    open: boolean;
  }>;
}
