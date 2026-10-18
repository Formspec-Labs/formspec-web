import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const scopeKey = 'a'.repeat(64);
const serverUrl = 'https://formspec-server.example.test';
async function runtime(page: Page, config: Record<string, unknown>) {
  await page.route('**/formspec-runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.__FORMSPEC_RUNTIME_CONFIG__ = ${JSON.stringify(config)};`,
  }));
}

for (const path of ['/', '/?form=published-form', '/status?caseLedgerId=urn:wos:case_demo_0001', '/obligations', '/documents']) {
  test(`unconfigured ${path} shows an accessible refusal without sample records`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await runtime(page, { profileName: 'publicPortal' });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This site is not ready.' })).toBeVisible();
    await expectReactShellCommitted(page);
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await expect(page.getByText('Demo Benefits Intake')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

for (const [name, key] of [['missing', undefined], ['malformed', 'not-a-scope']] as const) {
  test(`${name} deployment key refuses startup without a sign-in error`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await runtime(page, { profileName: 'publicPortal', formspecServerUrl: serverUrl, scopeKey: key });
    await page.goto('/?form=published-form');
    await expect(page.getByRole('heading', { name: 'This site is not ready.' })).toBeVisible();
    await expectReactShellCommitted(page);
    await expect(page.getByText('Sign-in could not be completed.', { exact: false })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('configured root requires a publisher form selection', async ({ page }) => {
  await runtime(page, { profileName: 'publicPortal', formspecServerUrl: serverUrl, scopeKey });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This form cannot be loaded.' })).toBeVisible();
  await expectReactShellCommitted(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('configured form load error has no automated accessibility violations', async ({ page }) => {
  await runtime(page, { profileName: 'publicPortal', formspecServerUrl: serverUrl, scopeKey });
  await page.route(`${serverUrl}/**`, route => route.fulfill({ status: 503, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ title: 'Service unavailable' }) }));
  await page.goto('/?form=published-form');
  await expect(page.getByRole('heading', { name: 'We could not load this form.' })).toBeVisible();
  await expectReactShellCommitted(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('configured OIDC sign-in surface has no automated accessibility violations', async ({ page }) => {
  await runtime(page, { profileName: 'departmentApp', formspecServerUrl: serverUrl, scopeKey });
  await page.goto('/?form=published-form');
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  await expectReactShellCommitted(page);
  await expect(page.getByRole('button', { name: 'Sign in with https://idp.example.gov/realms/formspec' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('no-JavaScript fallback explains the requirement', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('#formspec-static-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Loading form' })).toBeVisible();
    await expect(page.getByText('This form requires JavaScript.')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

async function expectReactShellCommitted(page: Page) {
  await expect(page.locator('#formspec-static-shell')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
}
