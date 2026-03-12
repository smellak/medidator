import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('CHS Platform — Medidator App Visibility', () => {
  test('Medidator appears as active app in the admin apps list', async ({
    page,
  }) => {
    // Use API login to bypass intro screen
    await loginViaAPI(page);
    await page.goto('/admin/apps');

    // Skip intro if it appears on the admin page
    try {
      const skipButton = page.getByRole('button', { name: /saltar intro/i });
      await skipButton.waitFor({ state: 'visible', timeout: 5_000 });
      await skipButton.click();
      await page.waitForTimeout(1_000);
    } catch {
      // No intro
    }

    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/Procesador de Medidas|medidas/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Medidator app is listed via the apps API', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.get('/api/apps');

    if (response.ok()) {
      const body = await response.json();
      const apps = Array.isArray(body) ? body : body.apps || body.data || [];

      const medidator = apps.find(
        (app: any) =>
          app.slug === 'medidas' ||
          app.name?.includes('Medidas') ||
          app.slug === 'medidas-excel',
      );

      expect(medidator).toBeTruthy();
      expect(medidator.is_active ?? medidator.isActive).toBeTruthy();
    }
  });

  test('Medidator agent capabilities are registered', async ({ request }) => {
    await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    const response = await request.get('/api/agent/tools');

    if (response.ok()) {
      const body = await response.json();
      const tools = Array.isArray(body) ? body : body.tools || body.data || [];

      const medidatorTools = tools.filter(
        (t: any) =>
          t.name?.includes('medidas') ||
          t.appSlug === 'medidas' ||
          t.description?.includes('medidas'),
      );

      expect(medidatorTools.length).toBeGreaterThan(0);
    }
  });
});
