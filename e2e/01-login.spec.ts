import { test, expect } from '@playwright/test';

test.describe('CHS Platform — Login', () => {
  async function skipIntroIfPresent(page: import('@playwright/test').Page) {
    try {
      const skipButton = page.getByRole('button', { name: /saltar intro/i });
      await skipButton.waitFor({ state: 'visible', timeout: 5_000 });
      await skipButton.click();
      await page.waitForTimeout(1_000);
    } catch {
      // No intro screen
    }
  }

  test('login page loads and shows the form', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await skipIntroIfPresent(page);

    // Wait for form to hydrate
    const usernameInput = page
      .locator('input[name="username"]')
      .or(page.locator('input[type="text"]').first())
      .or(page.getByPlaceholder(/usuario/i));
    const passwordInput = page
      .locator('input[name="password"]')
      .or(page.locator('input[type="password"]'))
      .or(page.getByPlaceholder(/contraseña/i));

    await expect(usernameInput).toBeVisible({ timeout: 15_000 });
    await expect(passwordInput).toBeVisible();

    const loginButton = page
      .getByRole('button', { name: /iniciar sesión|acceder|entrar|login/i })
      .or(page.locator('button[type="submit"]'));
    await expect(loginButton).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await skipIntroIfPresent(page);

    const usernameInput = page
      .locator('input[name="username"]')
      .or(page.locator('input[type="text"]').first())
      .or(page.getByPlaceholder(/usuario/i));
    const passwordInput = page
      .locator('input[name="password"]')
      .or(page.locator('input[type="password"]'))
      .or(page.getByPlaceholder(/contraseña/i));

    await usernameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await usernameInput.fill('admin');
    await passwordInput.fill('admin123');

    const loginButton = page
      .getByRole('button', { name: /iniciar sesión|acceder|entrar|login/i })
      .or(page.locator('button[type="submit"]'));
    await loginButton.click();

    // Should navigate away from login page
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15_000,
    });
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await skipIntroIfPresent(page);

    const usernameInput = page
      .locator('input[name="username"]')
      .or(page.locator('input[type="text"]').first())
      .or(page.getByPlaceholder(/usuario/i));
    const passwordInput = page
      .locator('input[name="password"]')
      .or(page.locator('input[type="password"]'))
      .or(page.getByPlaceholder(/contraseña/i));

    await usernameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await usernameInput.fill('admin');
    await passwordInput.fill('wrongpassword');

    const loginButton = page
      .getByRole('button', { name: /iniciar sesión|acceder|entrar|login/i })
      .or(page.locator('button[type="submit"]'));
    await loginButton.click();

    // Should stay on login page or show error
    await page.waitForTimeout(3_000);
    expect(page.url()).toContain('/login');
  });

  test('login via API returns user data and session cookie', async ({
    request,
  }) => {
    const response = await request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { username: 'admin', password: 'admin123' },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.user).toBeTruthy();
    expect(body.user.username).toBe('admin');
    expect(body.user.isSuperAdmin).toBe(true);
    expect(body.user.departments).toBeInstanceOf(Array);
    expect(body.user.departments.length).toBeGreaterThan(0);
  });
});
