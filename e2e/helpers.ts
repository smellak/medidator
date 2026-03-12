import { Page, expect } from '@playwright/test';

export const PLATFORM_HOST = 'platform.centrohogarsanchez.es';
export const MEDIDAS_HOST = 'medidas.centrohogarsanchez.es';
export const MEDIDAS_BASE = 'https://medidas.centrohogarsanchez.es';

/**
 * Skip the intro/splash animation if present.
 */
async function skipIntroIfPresent(page: Page) {
  try {
    const skipButton = page.getByRole('button', { name: /saltar intro/i });
    await skipButton.waitFor({ state: 'visible', timeout: 5_000 });
    await skipButton.click();
    await page.waitForTimeout(1_000);
  } catch {
    // Intro not present, continue
  }
}

/**
 * Login to CHS Platform via the browser UI.
 * Handles the intro splash screen if present.
 */
export async function loginViaBrowser(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  // Skip intro animation if present
  await skipIntroIfPresent(page);

  // Wait for the login form to appear after intro
  // Try multiple strategies to find the form
  const usernameInput = page
    .locator('input[name="username"]')
    .or(page.locator('input[type="text"]').first())
    .or(page.getByLabel(/usuario/i))
    .or(page.getByPlaceholder(/usuario/i));
  const passwordInput = page
    .locator('input[name="password"]')
    .or(page.locator('input[type="password"]'))
    .or(page.getByLabel(/contraseña/i))
    .or(page.getByPlaceholder(/contraseña/i));

  await usernameInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordInput.waitFor({ state: 'visible', timeout: 5_000 });

  await usernameInput.fill('admin');
  await passwordInput.fill('admin123');

  // Click the login button
  const loginButton = page
    .getByRole('button', { name: /iniciar sesión|acceder|entrar|login/i })
    .or(page.locator('button[type="submit"]'));
  await loginButton.click();

  // Wait for navigation to dashboard
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15_000,
  });
}

/**
 * Login via API and establish the session cookie in the page context.
 * Faster and more reliable — use for tests that don't focus on the login UI.
 */
export async function loginViaAPI(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    headers: { 'Content-Type': 'application/json' },
    data: { username: 'admin', password: 'admin123' },
  });
  expect(response.ok()).toBeTruthy();
  return response;
}

/**
 * Open the AI agent chat panel.
 */
export async function openAgentPanel(page: Page) {
  const agentButton = page.locator('[data-testid="agent-button"]');
  await agentButton.waitFor({ state: 'visible', timeout: 10_000 });
  await agentButton.click();

  const panel = page.locator('[data-testid="agent-panel"]');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });
  return panel;
}

/**
 * Send a message in the AI chat and wait for a response.
 */
export async function sendChatMessage(
  page: Page,
  message: string,
): Promise<string> {
  const input = page.locator('[data-testid="agent-input"]');
  await input.waitFor({ state: 'visible', timeout: 5_000 });
  await input.fill(message);
  await input.press('Enter');

  await page.waitForTimeout(2_000);

  // Wait for response to finish streaming (input is re-enabled)
  await page
    .locator('[data-testid="agent-input"]:not([disabled])')
    .waitFor({ state: 'visible', timeout: 30_000 });

  await page.waitForTimeout(500);

  const panel = page.locator('[data-testid="agent-panel"]');
  return await panel.innerText();
}
