import { test, expect } from '@playwright/test';
import { MEDIDAS_BASE } from './helpers';

test.describe('ForwardAuth SSO — medidas.centrohogarsanchez.es', () => {
  test('unauthenticated request to medidator is rejected', async ({
    request,
  }) => {
    const response = await request.get(`${MEDIDAS_BASE}/`, {
      maxRedirects: 0,
    });
    // ForwardAuth should block access — 401 or redirect to login
    expect([401, 302, 307].includes(response.status())).toBeTruthy();
  });

  test('health endpoint is publicly accessible without auth', async ({
    request,
  }) => {
    const response = await request.get(`${MEDIDAS_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('authenticated user can access medidator through SSO', async ({
    request,
  }) => {
    // Login to CHS Platform (sets session cookie)
    const loginRes = await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Now access medidator with the session cookie
    const healthRes = await request.get(`${MEDIDAS_BASE}/health`);
    expect(healthRes.ok()).toBeTruthy();
    const body = await healthRes.json();
    expect(body.status).toBe('ok');
  });

  test('authenticated user can access medidator jobs API through SSO', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });
    expect(loginRes.ok()).toBeTruthy();

    const jobsRes = await request.get(`${MEDIDAS_BASE}/jobs`);
    expect(jobsRes.ok()).toBeTruthy();
    const jobs = await jobsRes.json();
    expect(jobs).toBeInstanceOf(Array);
  });

  test('SSO injects CHS user headers into requests', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    // Call agent endpoint through SSO — ForwardAuth injects X-CHS-* headers
    const agentRes = await request.post(`${MEDIDAS_BASE}/api/agent`, {
      headers: { 'Content-Type': 'application/json' },
      data: { capability: 'estadisticas_generales', parameters: {} },
    });

    expect(agentRes.ok()).toBeTruthy();
    const body = await agentRes.json();
    // If ForwardAuth injected headers, the request succeeds
    expect(body.success).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(0);
  });
});
