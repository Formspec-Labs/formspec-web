import { expect, test } from '@playwright/test';

test('uses the explicit entry Surface after manifest reorder and preserves exact image alternatives', async ({
  page,
}) => {
  await page.goto('/tests/e2e/fixtures/surface-shell-page.html');

  await expect(page.locator('body')).toHaveAttribute(
    'data-entry-href',
    '/selected-entry',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Selected explicit entry' }),
  ).toBeVisible();
  await expect(page.getByText('Wrong surface sentinel')).toHaveCount(0);

  const meaningful = page.getByRole('img', {
    name: 'Benefits specialist helping an applicant',
  });
  await expect(meaningful).toHaveAttribute(
    'alt',
    'Benefits specialist helping an applicant',
  );
  const decorative = page.locator('img[alt=""]');
  await expect(decorative).toHaveCount(1);
  await expect(decorative).toHaveAttribute('role', 'presentation');
  await expect(page.locator('img')).toHaveCount(2);
});
