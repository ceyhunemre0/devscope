import { invoke } from "@tauri-apps/api/core";
import type {
  Project,
  Report,
  DashboardData,
  StatsData,
  DiscoveredRepo,
  Settings,
  GithubStatus,
  GithubRepo,
  CommitContext,
  CommitResult,
  ProjectPatch,
  BulkAddItem,
  ReportFilter,
  RunTodayArgs,
  GenerateCommitArgs,
  CloneArgs,
  SettingsPatch,
  HealthInfo,
} from "./types";

function formatDetail(kind: string, detail: unknown): string {
  if (detail == null) return kind;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.field === "string" && typeof obj.message === "string") {
      return `${obj.field}: ${obj.message}`;
    }
  }
  return `${kind}: ${JSON.stringify(detail)}`;
}

export class ApiError extends Error {
  readonly kind: string;
  readonly detail: string;
  readonly raw: unknown;

  constructor(payload: { kind: string; detail?: unknown }) {
    const detailText = formatDetail(payload.kind, payload.detail);
    super(detailText);
    this.name = "ApiError";
    this.kind = payload.kind;
    this.detail = detailText;
    this.raw = payload.detail;
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    if (e && typeof e === "object" && "kind" in e) {
      throw new ApiError(e as { kind: string; detail?: unknown });
    }
    throw e;
  }
}

export const api = {
  health: () => call<HealthInfo>("health"),

  listProjects: () => call<Project[]>("list_projects"),
  addProject: (path: string, name: string) =>
    call<Project>("add_project", { path, name }),
  updateProject: (id: number, patch: ProjectPatch) =>
    call<Project>("update_project", { id, patch }),
  deleteProject: (id: number) => call<void>("delete_project", { id }),
  discoverRepos: (root: string, maxDepth: number) =>
    call<DiscoveredRepo[]>("discover_repos", { root, maxDepth }),
  bulkAddProjects: (items: BulkAddItem[]) =>
    call<Project[]>("bulk_add_projects", { items }),

  listReports: (filter?: ReportFilter) =>
    call<Report[]>("list_reports", { filter: filter ?? null }),
  getReport: (id: number) => call<Report>("get_report", { id }),
  runToday: (args: RunTodayArgs) => call<Report>("run_today", { args }),

  getDashboard: () => call<DashboardData>("get_dashboard"),
  getStats: (rangeDays: number) =>
    call<StatsData>("get_stats", { rangeDays }),

  getCommitContext: (projectId: number) =>
    call<CommitContext>("get_commit_context", { projectId }),
  generateCommitMessage: (args: GenerateCommitArgs) =>
    call<CommitResult>("generate_commit_message", { args }),

  githubStatus: () => call<GithubStatus>("github_status"),
  setGithubToken: (token: string) =>
    call<GithubStatus>("set_github_token", { token }),
  listGithubRepos: () => call<GithubRepo[]>("list_github_repos"),
  cloneGithubRepo: (args: CloneArgs) =>
    call<Project>("clone_github_repo", { args }),

  getSettings: () => call<Settings>("get_settings"),
  saveSettings: (patch: SettingsPatch) =>
    call<Settings>("save_settings", { patch }),
  setSecret: (key: string, value: string) =>
    call<void>("set_secret", { key, value }),
  deleteSecret: (key: string) => call<void>("delete_secret", { key }),
};
