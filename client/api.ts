import type { Job, HealthResponse } from './types';

const BASE = '';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchJobs(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Job[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const url = qs.toString() ? `${BASE}/jobs?${qs}` : `${BASE}/jobs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to fetch job');
  return res.json();
}

export async function createJob(file: File): Promise<Job> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/jobs`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function runStage1(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs/${jobId}/stage1`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Stage 1 failed' }));
    throw new Error(err.error || 'Stage 1 failed');
  }
  return res.json();
}

export async function runPipeline(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs/${jobId}/run`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Pipeline failed' }));
    throw new Error(err.error || 'Pipeline failed');
  }
  return res.json();
}

export function getExportUrl(jobId: string, format: 'json' | 'csv'): string {
  return `${BASE}/jobs/${jobId}/export?format=${format}`;
}
