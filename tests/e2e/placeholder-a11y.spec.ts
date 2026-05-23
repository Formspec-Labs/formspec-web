import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('demo form renders and has no automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demo Benefits Intake' })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
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
