import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('demo form renders and has no automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demo Benefits Intake' })).toBeVisible();
  await expectReactShellCommitted(page);
  await expect(page.locator('#respondent-title')).toHaveCount(1);
  await expect(page.getByLabel('Full name')).toBeVisible();

  let accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('alert')).toContainText('Check the');
  accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);

  await page.getByRole('button', { name: 'Spanish' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitud de beneficios de demostracion' })).toBeVisible();
  await expect(page.getByLabel('Nombre completo')).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.test');
  await page.getByLabel('Preferred contact method').selectOption('email');
  await page.getByLabel('Member name').first().fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
  await expect(page.getByText(/^STUB-/)).toBeVisible();

  accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('load error surface has no automated accessibility violations', async ({ page }) => {
  await page.route('**/formspec-runtime-config.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__FORMSPEC_RUNTIME_CONFIG__ = { profileName: "publicPortal", formspecServerUrl: "http://127.0.0.1:59999" };',
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'We could not load this form.' })).toBeVisible();
  await expectReactShellCommitted(page);
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('oidc-required sign-in surface has no automated accessibility violations', async ({ page }) => {
  await page.route('**/formspec-runtime-config.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__FORMSPEC_RUNTIME_CONFIG__ = { profileName: "departmentApp", formspecServerUrl: "https://formspec-server.example.test" };',
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  await expectReactShellCommitted(page);
  await expect(page.getByRole('button', { name: 'Sign in with https://idp.example.gov/realms/formspec' })).toBeVisible();
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('demo submit click-through opens an accessible status page (FW-0039 slice 1)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demo Benefits Intake' })).toBeVisible();
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.test');
  await page.getByLabel('Preferred contact method').selectOption('email');
  await page.getByLabel('Member name').first().fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
  const trackingLink = page.getByRole('link', { name: /Track this application/i });
  await expect(trackingLink).toBeVisible();
  const href = await trackingLink.getAttribute('href');
  expect(href).toMatch(/^\/status\?case=urn%3Awos%3Acase_demo_/);

  await trackingLink.click();
  await expect(page.getByRole('heading', { name: 'Your application status', level: 1 })).toBeVisible();
  // The freshly-submitted case URN is not pre-registered in the stub status
  // reader (only the pre-seeded urn:wos:case_demo_0001 is). The page renders
  // the unknown-URN copy honestly — which is exactly what we want to assert.
  await expect(page.getByText(/We don't have status for this reference/i)).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('direct /status?case=urn:wos:case_demo_0001 renders the demo case (FW-0039 slice 1)', async ({ page }) => {
  await page.goto('/status?case=urn:wos:case_demo_0001');
  await expect(page.getByRole('heading', { name: 'Your application status', level: 1 })).toBeVisible();
  await expect(page.getByText('Timing for similar applications is not yet available on this site.')).toBeVisible();
  await expect(page.getByText('Time since each step on your application')).toBeVisible();
  await expect(page.getByRole('heading', { name: /AI participated in this case/i })).toBeVisible();
  await expect(page.getByRole('list', { name: /Application stages/i })).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('direct /obligations renders the dashboard with cross-sender framing (FW-0055 slice 1)', async ({ page }) => {
  await page.goto('/obligations');
  await expect(page.getByRole('heading', { name: 'What you owe', level: 1 })).toBeVisible();
  await expect(
    page.getByText(/across \d+ senders?\./),
  ).toBeVisible();
  await expect(
    page.getByText('Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site.'),
  ).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('direct /documents renders the library with per-kind sections + deferred-presentation copy (FW-0056 slice 1)', async ({ page }) => {
  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Your documents', level: 1 })).toBeVisible();
  await expect(page.getByText(/across \d+ kinds?\./)).toBeVisible();
  await expect(
    page.getByText('Selective presentation, derived-claim disclosure, per-presentation revocation, retention horizons, and client-side encryption are not yet available on this site.'),
  ).toBeVisible();

  // Selection action is captured intent only — clicking shows the deferred
  // presentation copy.
  const useButton = page.getByRole('button', { name: 'Use this document…' }).first();
  await useButton.click();
  await expect(
    page.getByText('Selective presentation is not yet available on this site. When it lands, this button will share the document with the chosen scope.'),
  ).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('mobile viewport keeps primary controls at tap-target size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
  expect(viewport).toContain('initial-scale=1.0');

  for (const locator of [
    page.getByRole('button', { name: 'English' }),
    page.getByRole('button', { name: 'Spanish' }),
    page.getByLabel('Full name'),
    page.getByRole('button', { name: 'Submit' }),
  ]) {
    const box = await locator.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
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
