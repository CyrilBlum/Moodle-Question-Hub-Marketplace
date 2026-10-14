export interface PackageTaxonomy {
  framework: string;
  canton?: string;
  level?: string;
  grades?: string[];
  subject_category?: string;
  subject: string;
  topic?: string;
  tags?: string[];
}

export interface PackageManifest {
  id: string;
  version: string;
  title: string;
  summary: string;
  language: string;
  license: string;
  taxonomy: PackageTaxonomy;
  release_notes?: string;
  /** Whether the Hub shows a public preview of the questions (default true). */
  preview_enabled?: boolean;
}

export interface PackageRecord {
  id: string;
  owner_id: string;
  title: string;
  summary: string;
  language: string;
  license: string;
  framework: string;
  subject: string;
  subject_category: string;
  topic?: string | null;
  canton?: string | null;
  latest_version: string;
  downloads_count: number;
  is_monetised: boolean | number;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ReleaseRecord {
  id: string;
  package_id: string;
  version: string;
  sha256: string;
  file_path: string;
  file_size_bytes: number;
  question_count: number;
  qtypes_json: string;
  categories_json: string;
  release_notes?: string | null;
  is_yanked: boolean | number;
  created_at: string | Date;
}

export interface PackageSearchResult {
  id: string;
  title: string;
  summary: string;
  language: string;
  license: string;
  author: {
    id?: string;
    name: string;
    institution: string;
    canton: string;
  };
  taxonomy: PackageTaxonomy;
  latest_version: string;
  versions: string[];
  preview_enabled: boolean;
  stats: {
    question_count: number;
    categories_count: number;
    downloads_count: number;
    qtypes_breakdown?: Record<string, number>;
  };
  compatibility: {
    min_moodle_version: string;
    tested_versions: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface PackageDetailResult extends PackageSearchResult {
  categories: string[];
  releases: Array<{
    version: string;
    sha256: string;
    file_size_bytes: number;
    question_count: number;
    release_notes?: string;
    download_url: string;
    created_at: string;
  }>;
}
