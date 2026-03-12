import { test, expect } from '@playwright/test';
import { MEDIDAS_BASE } from './helpers';

test.describe('Medidator — Jobs REST API (via ForwardAuth)', () => {
  test.beforeEach(async ({ request }) => {
    // Login to get session cookie for all requests
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });
  });

  test('GET /health returns server status', async ({ request }) => {
    const response = await request.get(`${MEDIDAS_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  test('GET /jobs returns list of all jobs', async ({ request }) => {
    const response = await request.get(`${MEDIDAS_BASE}/jobs`);
    expect(response.ok()).toBeTruthy();
    const jobs = await response.json();
    expect(jobs).toBeInstanceOf(Array);
    expect(jobs.length).toBeGreaterThan(0);

    const job = jobs[0];
    expect(job.id).toBeTruthy();
    expect(job.status).toBeTruthy();
    expect(job.created_at).toBeTruthy();
    expect(job.stages).toBeTruthy();
  });

  test('GET /jobs with status filter', async ({ request }) => {
    const response = await request.get(
      `${MEDIDAS_BASE}/jobs?status=completed`,
    );
    expect(response.ok()).toBeTruthy();
    const jobs = await response.json();
    expect(jobs).toBeInstanceOf(Array);

    for (const job of jobs) {
      expect(job.status).toBe('completed');
    }
  });

  test('GET /jobs with limit and offset', async ({ request }) => {
    const response = await request.get(
      `${MEDIDAS_BASE}/jobs?limit=2&offset=0`,
    );
    expect(response.ok()).toBeTruthy();
    const jobs = await response.json();
    expect(jobs).toBeInstanceOf(Array);
    expect(jobs.length).toBeLessThanOrEqual(2);
  });

  test('GET /jobs/:jobId returns specific job details', async ({
    request,
  }) => {
    const listResponse = await request.get(`${MEDIDAS_BASE}/jobs?limit=1`);
    const jobs = await listResponse.json();
    if (jobs.length === 0) {
      test.skip();
      return;
    }

    const jobId = jobs[0].id;
    const response = await request.get(`${MEDIDAS_BASE}/jobs/${jobId}`);
    expect(response.ok()).toBeTruthy();
    const job = await response.json();
    expect(job.id).toBe(jobId);
    expect(job.stages).toBeTruthy();

    // All 7 stages should be present
    expect(Object.keys(job.stages)).toHaveLength(7);
  });

  test('GET /jobs/:jobId returns 404 for non-existent job', async ({
    request,
  }) => {
    const response = await request.get(
      `${MEDIDAS_BASE}/jobs/non-existent-id-12345`,
    );
    expect(response.status()).toBe(404);
  });

  test('GET /jobs/:jobId/export returns data in JSON format', async ({
    request,
  }) => {
    const listResponse = await request.get(`${MEDIDAS_BASE}/jobs?limit=1`);
    const jobs = await listResponse.json();
    if (jobs.length === 0) {
      test.skip();
      return;
    }

    const jobId = jobs[0].id;
    const response = await request.get(
      `${MEDIDAS_BASE}/jobs/${jobId}/export?format=json`,
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);
  });

  test('GET /jobs/:jobId/export returns data in CSV format', async ({
    request,
  }) => {
    const listResponse = await request.get(`${MEDIDAS_BASE}/jobs?limit=1`);
    const jobs = await listResponse.json();
    if (jobs.length === 0) {
      test.skip();
      return;
    }

    const jobId = jobs[0].id;
    const response = await request.get(
      `${MEDIDAS_BASE}/jobs/${jobId}/export?format=csv`,
    );
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/csv');

    const csvText = await response.text();
    const lines = csvText.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });
});
