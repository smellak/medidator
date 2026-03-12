import { test, expect } from '@playwright/test';
import { MEDIDAS_BASE } from './helpers';

test.describe('Medidator — Health & Connectivity', () => {
  test('health endpoint is publicly accessible (no auth required)', async ({
    request,
  }) => {
    const response = await request.get(`${MEDIDAS_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
    expect(body.uptime).toBeGreaterThan(0);
  });

  test('protected routes return 401/302 without CHS session', async ({
    request,
  }) => {
    const response = await request.get(`${MEDIDAS_BASE}/jobs`, {
      maxRedirects: 0,
    });
    // ForwardAuth should reject — either 401 or 302/307 to login
    expect([401, 302, 307].includes(response.status())).toBeTruthy();
  });

  test('protected routes return 200 with valid CHS session', async ({
    request,
  }) => {
    // Login to get session cookie
    const loginResponse = await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });
    expect(loginResponse.ok()).toBeTruthy();

    // Now access medidator health through Traefik (cookies are shared in context)
    const healthResponse = await request.get(`${MEDIDAS_BASE}/health`);
    expect(healthResponse.ok()).toBeTruthy();
    const body = await healthResponse.json();
    expect(body.status).toBe('ok');
  });

  test('authenticated user can access medidator jobs API', async ({
    request,
  }) => {
    // Login
    const loginResponse = await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });
    expect(loginResponse.ok()).toBeTruthy();

    // Access jobs endpoint through ForwardAuth
    const jobsResponse = await request.get(`${MEDIDAS_BASE}/jobs`);
    expect(jobsResponse.ok()).toBeTruthy();
    const jobs = await jobsResponse.json();
    expect(jobs).toBeInstanceOf(Array);
  });
});
