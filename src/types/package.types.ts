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
  visibility?: 'public' | 'private';
  /** Version the client's content is based on; a newer Hub release rejects the update (pull first). */
  base_version?: string;
  /** Optional GitHub repository (SSH or HTTPS URL) every release is committed to; '' or null unlinks. */
  github_repo?: string | null;
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
  visibility?: 'public' | 'private';
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
  visibility: 'public' | 'private';
  access_status?: 'pending' | 'approved' | 'denied';
  can_access?: boolean;
  /** The viewer's role on the package (creator = admin); null without one. */
  my_role?: 'admin' | 'editor' | 'member' | null;
  /** Package admin or Hub admin: may edit settings, members, access requests and withdraw. */
  can_manage?: boolean;
  /** Linked GitHub repository (git@github.com:owner/repo.git); only shown to package admins. */
  github_repo?: string | null;
  access_requests?: Array<{
    id: string;
    requester: { id: string; name: string; email: string | null; institution: string | null };
    status: 'pending' | 'approved' | 'denied';
    created_at: string;
    updated_at: string;
    message: string | null;
    response_message: string | null;
    share_contact: boolean;
  }>;
  /** Package this one was forked from (also when that package was withdrawn since). */
  forked_from_id?: string | null;
  /** Category paths of the latest release, e.g. $course$/top/Informatik/Bäume. */
  categories?: string[];
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
  /** Origin of a fork: the original (null title when it was withdrawn or is not visible to the viewer). */
  forked_from?: {
    id: string;
    version: string | null;
    license: string | null;
    title: string | null;
    author_name: string | null;
    exists: boolean;
  } | null;
  /** Forks the viewer can see. */
  forks_count?: number;
  open_merge_requests_count?: number;
  releases: Array<{
    version: string;
    sha256: string;
    file_size_bytes: number;
    question_count: number;
    release_notes?: string;
    download_url: string;
    created_at: string;
    /** Only for package admins: the GitHub commit of this release, or why it failed. */
    github_commit_url?: string | null;
    github_error?: string | null;
  }>;
}
