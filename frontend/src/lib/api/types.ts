// TypeScript interfaces mirroring the Python Pydantic models in src/devscope/web/app.py
// Datetime fields use ISO 8601 strings (FastAPI default serialization).

export interface HealthOut {
  ok: boolean;
  version: string;
}

export interface ProjectOut {
  id: number;
  name: string;
  path: string;
  state: string;
  summary: string | null;
  tech_stack: string[] | null;
  last_activity_at: string | null;
  github_full_name: string | null;
}

export interface ReportOut {
  id: number;
  project_id: number | null;
  type: string;
  content: string;
  period_start: string | null;
  period_end: string | null;
  generated_at: string;
}

export interface DashboardOut {
  project_count: number;
  report_count: number;
  latest: ReportOut | null;
  openai_stored: boolean;
  openai_env_active: boolean;
  ollama_default_model: string;
  openai_default_model: string;
}

export interface DiscoveredRepo {
  path: string;
  suggested_name: string;
}

export interface SettingsOut {
  secrets_path: string;
  openai_env_active: boolean;
  openai_stored: boolean;
  openai_masked: string;
}

// Request bodies

export interface AddProjectIn {
  path: string;
  name: string;
}

export interface DiscoverIn {
  root: string;
  depth?: number;
}

export interface RunTodayIn {
  since_hours?: number;
  provider?: string;
  project?: string | null;
}

export interface SettingsIn {
  openai_api_key?: string;
  clear_openai?: boolean;
}

export interface SuggestCommitIn {
  provider?: "auto" | "openai" | "ollama";
}

export interface SuggestCommitOut {
  has_changes: boolean;
  status: string;
  message: string;
  truncated: boolean;
}

export interface WorkingTreeStatusOut {
  has_changes: boolean;
  files_changed: number;
  insertions: number;
  deletions: number;
  untracked_count: number;
}

export interface GitHubStatusOut {
  configured: boolean;
  login: string | null;
  avatar_url: string | null;
  masked: string;
  error: string | null;
}

export interface GitHubTokenIn {
  token?: string;
  clear?: boolean;
}

export interface GitHubRepoOut {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  default_branch: string;
  clone_url: string;
  pushed_at: string | null;
  stargazers_count: number;
  language: string | null;
}

export interface GitHubContribDayOut {
  date: string;
  count: number;
  color: string;
}

export interface GitHubContributionsOut {
  login: string;
  total: number;
  commits: number;
  issues: number;
  pull_requests: number;
  reviews: number;
  days: GitHubContribDayOut[];
}

export interface GitHubCloneIn {
  full_name: string;
  clone_url: string;
  parent_dir: string;
  name?: string;
}
