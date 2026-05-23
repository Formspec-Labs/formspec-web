import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('placeholder shell renders and has no automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Formspec Web' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Wired MVP ports' })).toContainText(
    'DefinitionSource: wired',
  );

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
