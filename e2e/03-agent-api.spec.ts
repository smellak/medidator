import { test, expect } from '@playwright/test';
import { MEDIDAS_BASE } from './helpers';

test.describe('Medidator — Agent API (via ForwardAuth)', () => {
  test('rejects unauthenticated requests to agent API', async ({ request }) => {
    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'estadisticas_generales', parameters: {} },
      maxRedirects: 0,
    });
    // ForwardAuth blocks unauthenticated requests
    expect([401, 302, 307].includes(response.status())).toBeTruthy();
  });

  test('rejects unknown capabilities', async ({ request }) => {
    // Login first
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'capability_que_no_existe', parameters: {} },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('UNKNOWN_CAPABILITY');
    expect(body.text).toContain('no reconocida');
  });

  test('estadisticas_generales returns global stats', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'estadisticas_generales', parameters: {} },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.text).toContain('Procesador de Medidas');
    expect(body.data).toBeTruthy();
    expect(body.data.total).toBeGreaterThanOrEqual(0);
    expect(body.data.byStatus).toBeTruthy();
    expect(typeof body.data.byStatus.completed).toBe('number');
    expect(typeof body.data.byStatus.error).toBe('number');
    expect(typeof body.data.byStatus.processing).toBe('number');
    expect(typeof body.data.byStatus.created).toBe('number');
    expect(typeof body.data.byStatus.ingested).toBe('number');
  });

  test('listar_jobs returns job list with pagination', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'listar_jobs', parameters: { limite: 3 } },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(0);
    expect(body.data.jobs).toBeInstanceOf(Array);
    expect(body.data.jobs.length).toBeLessThanOrEqual(3);

    if (body.data.jobs.length > 0) {
      const job = body.data.jobs[0];
      expect(job.id).toBeTruthy();
      expect(job.status).toBeTruthy();
      expect(job.created_at).toBeTruthy();
      expect(typeof job.stages_completados).toBe('number');
      expect(job.stages_total).toBe(7);
    }
  });

  test('listar_jobs default limit returns up to 20 jobs', async ({
    request,
  }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'listar_jobs', parameters: {} },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.jobs.length).toBeLessThanOrEqual(20);
  });

  test('ver_job returns detailed job information', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    // Get a job ID first
    const listResponse = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'listar_jobs', parameters: { limite: 1 } },
    });
    const listBody = await listResponse.json();

    if (listBody.data.jobs.length === 0) {
      test.skip();
      return;
    }

    const jobId = listBody.data.jobs[0].id;

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'ver_job', parameters: { jobId } },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.text).toContain(jobId);
    expect(body.data.id).toBe(jobId);
    expect(body.data.status).toBeTruthy();
    expect(body.data.stages).toBeTruthy();

    // Verify all 7 stages are present
    const stageNames = [
      'stage1_ingest_normalize',
      'stage2_paquete_estimable',
      'stage3_normalize_measures',
      'stage4_ia_enrichment',
      'stage5_outliers_clean',
      'stage6_filter_sets',
      'stage7_stats',
    ];
    for (const stage of stageNames) {
      expect(body.data.stages[stage]).toBeTruthy();
      expect(['pending', 'processing', 'success', 'error']).toContain(
        body.data.stages[stage].status,
      );
    }
  });

  test('ver_job returns error for non-existent job', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        capability: 'ver_job',
        parameters: { jobId: 'nonexistent-job-999' },
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('JOB_NOT_FOUND');
  });

  test('ver_metricas_stage1 returns ingestion metrics with preview', async ({
    request,
  }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    // Get a job ID first
    const listResponse = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'listar_jobs', parameters: { limite: 1 } },
    });
    const listBody = await listResponse.json();

    if (listBody.data.jobs.length === 0) {
      test.skip();
      return;
    }

    const jobId = listBody.data.jobs[0].id;

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'ver_metricas_stage1', parameters: { jobId } },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.totalRows).toBeGreaterThan(0);
    expect(body.data.columns).toBeInstanceOf(Array);
    expect(body.data.columns.length).toBeGreaterThan(0);
    expect(body.data.columnsCount).toBeGreaterThan(0);
    expect(body.data.preview).toBeInstanceOf(Array);
    expect(body.data.preview.length).toBeLessThanOrEqual(5);

    if (body.data.preview.length > 0) {
      const firstRow = body.data.preview[0];
      expect(Object.keys(firstRow).length).toBeGreaterThan(0);
    }
  });

  test('ver_metricas_stage1 missing jobId returns error', async ({
    request,
  }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'ver_metricas_stage1', parameters: {} },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('MISSING_PARAM');
  });
});
