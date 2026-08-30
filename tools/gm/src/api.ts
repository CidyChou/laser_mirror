import type { GmLevel, ValidationIssue } from '../schema';

export type GmState = {
  levels: GmLevel[];
  dirty: boolean;
  projectCount: number;
  dataPath: string;
  exportPath: string;
  issues: ValidationIssue[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `${response.status} ${response.statusText}`) as Error & { issues?: ValidationIssue[] };
    error.issues = data.issues;
    throw error;
  }
  return data as T;
}

export const api = {
  state: () => request<GmState>('/api/state'),
  save: (levels: GmLevel[]) => request<{ ok: boolean; count: number; issues: ValidationIssue[] }>('/api/levels', {
    method: 'PUT',
    body: JSON.stringify({ levels }),
  }),
  exportToProject: () => request<{ ok: boolean; count: number; exportPath: string; message: string }>('/api/export', { method: 'POST' }),
  resetFromProject: () => request<{ ok: boolean; levels: GmLevel[]; count: number }>('/api/reset', { method: 'POST' }),
};
