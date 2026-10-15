export interface DiagnosticItem {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  questionIndex?: number;
  questionName?: string;
  categoryPath?: string;
  field?: string;
  details?: Record<string, any>;
}

export interface DiagnosticReport {
  valid: boolean;
  can_publish: boolean;
  stats: {
    question_count: number;
    categories_count: number;
    categories: string[];
    qtypes_breakdown: Record<string, number>;
    embedded_media_count: number;
    total_media_bytes: number;
  };
  diagnostics: {
    errors: DiagnosticItem[];
    warnings: DiagnosticItem[];
  };
}

export interface SanitizedOption {
  id: string;
  textHtml: string;
}

export interface SanitizedQuestion {
  id: string;
  name: string;
  type: string;
  category: string;
  questiontextHtml: string;
  generalfeedbackHtml?: string;
  options?: SanitizedOption[];
  subquestions?: Array<{ textHtml: string; answerHtml?: string }>;
  /** CodeRunner: code the answer box starts with (plain text). */
  answerPreload?: string;
  mediaFiles: Record<string, string>; // filename -> data URI
}

export interface SanitizedPreview {
  packageId: string;
  version: string;
  title: string;
  categories: Array<{
    id: string;
    name: string;
    path: string;
    questionCount: number;
  }>;
  questions: SanitizedQuestion[];
}
