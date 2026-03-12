import { test, expect } from '@playwright/test';
import { loginViaAPI, openAgentPanel } from './helpers';

test.describe('CHS Platform — AI Chat with Medidator', () => {
  test.beforeEach(async ({ page }) => {
    // Use API login — faster and avoids intro screen
    await loginViaAPI(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Skip intro if present on dashboard
    try {
      const skipButton = page.getByRole('button', { name: /saltar intro/i });
      await skipButton.waitFor({ state: 'visible', timeout: 5_000 });
      await skipButton.click();
      await page.waitForTimeout(1_000);
    } catch {
      // No intro
    }

    // Wait for dashboard to load
    await page.waitForLoadState('networkidle');
  });

  test('agent button is visible on dashboard', async ({ page }) => {
    const agentButton = page.locator('[data-testid="agent-button"]');
    await expect(agentButton).toBeVisible({ timeout: 15_000 });
  });

  test('clicking agent button opens the chat panel', async ({ page }) => {
    const panel = await openAgentPanel(page);
    await expect(panel).toBeVisible();

    const input = page.locator('[data-testid="agent-input"]');
    await expect(input).toBeVisible();
  });

  test('chat input accepts text and can be submitted', async ({ page }) => {
    await openAgentPanel(page);

    const input = page.locator('[data-testid="agent-input"]');
    await input.fill('hola');
    await expect(input).toHaveValue('hola');

    await input.press('Enter');
    await page.waitForTimeout(1_000);

    const panel = page.locator('[data-testid="agent-panel"]');
    await expect(panel).toContainText('hola', { timeout: 5_000 });
  });

  test('asking about medidas stats gets a response from Medidator agent', async ({
    page,
  }) => {
    await openAgentPanel(page);

    const input = page.locator('[data-testid="agent-input"]');
    await input.fill(
      'Dame las estadísticas generales del procesador de medidas',
    );
    await input.press('Enter');

    const panel = page.locator('[data-testid="agent-panel"]');
    await expect(panel).toContainText(/jobs|medidas|total|completad/i, {
      timeout: 30_000,
    });
  });

  test('asking to list jobs gets job data from Medidator', async ({
    page,
  }) => {
    await openAgentPanel(page);

    const input = page.locator('[data-testid="agent-input"]');
    await input.fill('Lista los últimos 3 jobs del procesador de medidas');
    await input.press('Enter');

    const panel = page.locator('[data-testid="agent-panel"]');
    await expect(panel).toContainText(/job|procesamiento|stage|completad/i, {
      timeout: 30_000,
    });
  });
});
