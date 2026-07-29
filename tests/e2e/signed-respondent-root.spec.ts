import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  BUNDLE_TITLE,
  CEREMONY_SENTINEL,
  INTAKE_TITLE,
  STAFF_SENTINEL,
  TENANT_COLOR,
  type AdmissionCase,
  createSignedRespondentFixture,
  installRespondentRoutes,
} from './fixtures/signed-respondent-fixture.ts';

test.describe('signed respondent production root', () => {
  test('checks, admits, fills, saves, submits, restores the real receipt, and preserves navigation boundaries', async ({
    page,
  }) => {
    const fixture = await createSignedRespondentFixture();
    const routes = await installRespondentRoutes(page, fixture, {
      holdBundle: true,
    });

    await page.goto('/apply');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Checking this app' }),
    ).toBeVisible();
    await expect(page.locator('#formspec-static-shell')).toHaveCount(0);
    expect(await page.title()).toBe('Formspec Web');
    routes.releaseBundle();

    await expect(
      page.getByRole('heading', { level: 1, name: INTAKE_TITLE }),
    ).toBeVisible();
    await expect(page.locator('#formspec-static-shell')).toHaveCount(0);
    const verification = page.getByLabel('App verification');
    await expect(verification).toContainText('Verified app');
    await expect(verification).toContainText(
      'Published by Example Benefits Publisher',
    );
    await expect(verification).toContainText('Release respondent-e2e-2026-07-28');
    await expect(page).toHaveTitle(BUNDLE_TITLE);
    await expect(page.locator('h1')).toHaveCount(1);

    const intake = page.locator('[data-route="apply"]');
    await expect(intake).toHaveAttribute('data-tenant-theme', 'admitted');
    expect(
      await intake.evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue(
          '--formspec-color-primary',
        )),
    ).toBe(TENANT_COLOR);
    expect(
      await page.locator('html').evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue(
          '--formspec-color-primary',
        )),
    ).toBe('');
    await expect(page.getByText(STAFF_SENTINEL)).toHaveCount(0);
    await expect(page.getByText(CEREMONY_SENTINEL)).toHaveCount(0);
    await expect(page.locator('[data-widget="queue-table"]')).toHaveCount(0);
    await expect(page.locator('[data-widget="ceremony-frame"]')).toHaveCount(0);

    await expect(page.getByRole('textbox', { name: /Full name/u })).toBeVisible();

    await page.getByRole('button', { name: 'es', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Paginas verificadas E2E' }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /Nombre completo/u }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /Correo electronico/u }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'en', exact: true }).click();
    await expect(
      page.getByRole('navigation', {
        name: 'English respondent navigationLabel',
      }),
    ).toBeVisible();

    await page.getByRole('textbox', { name: /Full name/u }).fill('Ada Lovelace');
    await page
      .getByRole('textbox', { name: /Email address/u })
      .fill('ada@example.test');
    await page
      .getByRole('combobox', { name: /Preferred contact method/u })
      .selectOption('email');
    await page
      .getByRole('textbox', { name: /Member name/u })
      .first()
      .fill('Ada Lovelace');

    const accessibility = await wcagScan(page);
    expect(accessibility.violations).toEqual([]);

    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page).toHaveURL(/\/receipt\/CASE-301$/u);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Your receipt' }),
    ).toBeVisible();
    await expect(page.getByText('CASE-301')).toBeVisible();
    await expect(page.getByText('accepted')).toBeVisible();
    await expect(page.getByLabel('App verification')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    expect((await wcagScan(page)).violations).toEqual([]);

    const proof = page.locator('[data-route="receipt"]');
    await expect(proof).toHaveAttribute('data-tenant-theme', 'refused');
    await expect(proof).toHaveAttribute('data-tenant-token-count', '0');
    expect(await proof.getAttribute('style')).not.toContain(TENANT_COLOR);
    expect(
      await page.locator('html').evaluate((element) =>
        Array.from((element as HTMLElement).style).filter((property) =>
          property.startsWith('--formspec-'))),
    ).toEqual([]);

    const sessionRequest = routes.requests.find(({ url }) =>
      url.endsWith('/runtime/forms/demo-intake/sessions/anonymous'));
    expect(sessionRequest?.method).toBe('POST');
    const draftRequest = routes.requests.find(({ url }) =>
      url.endsWith('/runtime/forms/demo-intake/drafts'));
    expect(draftRequest).toMatchObject({
      method: 'POST',
      body: {
        anonymous_session_token: 'anonymous-session-token-e2e',
      },
    });
    expect(JSON.stringify(draftRequest?.body)).toContain('Ada Lovelace');
    const submitRequest = routes.requests.find(({ url }) =>
      url.endsWith('/drafts/DRAFT-301/submit'));
    expect(submitRequest?.method).toBe('POST');
    expect(submitRequest?.headers['idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(submitRequest?.body).toMatchObject({
      anonymous_session_token: 'anonymous-session-token-e2e',
    });

    await page.goBack();
    await expect(page).toHaveURL(/\/apply$/u);
    await expect(
      page.getByRole('heading', { level: 1, name: INTAKE_TITLE }),
    ).toBeVisible();
    await expect(page.getByLabel('App verification')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Full name/u })).toHaveValue(
      'Ada Lovelace',
    );
    await page.goForward();
    await expect(page).toHaveURL(/\/receipt\/CASE-301$/u);
    await expect(page.getByText('CASE-301')).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Your receipt' }),
    ).toBeVisible();
    await expect(page.getByText('CASE-301')).toBeVisible();
    await expect(page.getByText('accepted')).toBeVisible();
    await expect(page.getByLabel('App verification')).toBeVisible();
    await expect(page).toHaveTitle(BUNDLE_TITLE);
  });

  test('supports keyboard and mobile use in light and dark preferences', async ({
    page,
  }) => {
    const fixture = await createSignedRespondentFixture();
    await installRespondentRoutes(page, fixture);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/apply');
    await expect(
      page.getByRole('heading', { level: 1, name: INTAKE_TITLE }),
    ).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'en', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'es', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('navigation', { name: 'Paginas verificadas E2E' }),
    ).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    const primaryTargetBox = await page
      .getByRole('button', { name: 'Submit' })
      .boundingBox();
    expect(primaryTargetBox?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() =>
        window.matchMedia('(prefers-color-scheme: dark)').matches),
    ).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    expect(
      await page.evaluate(() =>
        window.matchMedia('(prefers-color-scheme: light)').matches),
    ).toBe(true);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('shows an explicit unavailable receipt instead of inventing proof', async ({
    page,
  }) => {
    const fixture = await createSignedRespondentFixture();
    await installRespondentRoutes(page, fixture);
    await page.goto('/receipt/MISSING-301');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Your receipt' }),
    ).toBeVisible();
    await expect(
      page.locator('[data-widget-data="unavailable"]'),
    ).toBeVisible();
    await expect(
      page.getByText('English respondent slotUnavailableWidgetData'),
    ).toBeVisible();
    await expect(page.getByText('accepted')).toHaveCount(0);
    await expect(page.getByLabel('App verification')).toBeVisible();
    expect((await wcagScan(page)).violations).toEqual([]);
  });
});

const refusedCases: readonly AdmissionCase[] = [
  'unsigned',
  'unsupported-method',
  'unknown-key',
  'wrong-publisher',
  'wrong-app',
  'expired',
  'revoked',
  'stale-release',
  'signed-staff-route',
  'invalid-entry-surface',
  'ambiguous-entry-surface',
  'signed-metadata-tamper',
  'document-tamper',
  'replacement-sidecar-key',
];

for (const admissionCase of refusedCases) {
  test(`refuses ${admissionCase} before bundle DOM or title authority`, async ({
    page,
  }) => {
    const fixture = await createSignedRespondentFixture(admissionCase);
    const routes = await installRespondentRoutes(page, fixture);
    await page.goto('/apply');

    await expect(page.locator('[data-admission-status]')).toHaveAttribute(
      'data-admission-status',
      /^(failure|unsupported|adapter-error)$/u,
    );
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.title()).toBe('Formspec Web');
    await expect(page.locator('body')).not.toContainText(BUNDLE_TITLE);
    await expect(page.locator('body')).not.toContainText(INTAKE_TITLE);
    await expect(page.locator('body')).not.toContainText(STAFF_SENTINEL);
    await expect(page.locator('body')).not.toContainText(CEREMONY_SENTINEL);
    await expect(page.locator('body')).not.toContainText(
      'Tampered document sentinel',
    );
    await expect(page.locator('[data-route]')).toHaveCount(0);
    await expect(page.locator('[data-widget]')).toHaveCount(0);
    expect(routes.requests).toEqual([]);
  });
}

function wcagScan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}
