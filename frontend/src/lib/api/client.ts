import type {
  AddProjectIn,
  DashboardOut,
  DiscoverIn,
  DiscoveredRepo,
  HealthOut,
  ProjectOut,
  ReportOut,
  RunTodayIn,
  SettingsIn,
  SettingsOut,
} from './types';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = typeof json?.detail === 'string' ? json.detail : JSON.stringify(json);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthOut>('/health'),
  dashboard: () => request<DashboardOut>('/dashboard'),
  listProjects: () => request<ProjectOut[]>('/projects'),
  addProject: (body: AddProjectIn) =>
    request<ProjectOut>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  discoverProjects: (body: DiscoverIn) =>
    request<DiscoveredRepo[]>('/projects/discover', { method: 'POST', body: JSON.stringify(body) }),
  bulkAddProjects: (items: AddProjectIn[]) =>
    request<ProjectOut[]>('/projects/bulk-add', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  listReports: (limit = 50) => request<ReportOut[]>(`/reports?limit=${limit}`),
  runToday: (body: RunTodayIn) =>
    request<ReportOut>('/actions/run-today', { method: 'POST', body: JSON.stringify(body) }),
  getSettings: () => request<SettingsOut>('/settings'),
  saveSettings: (body: SettingsIn) =>
    request<SettingsOut>('/settings', { method: 'POST', body: JSON.stringify(body) }),
};
