import type { LocaleDocument } from '@formspec-org/types';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
} from '../../src/policy/index.ts';

describe('locale change + runtime-feature recompute (ADR-0011 §Resolution)', () => {
  it('seed taxonomy has zero locale-conditional keys — handler stays in-place', () => {
    expect(LOCALE_CONDITIONAL_FEATURE_KEYS.size).toBe(0);
  });

  it('tripwire: if a future ADR adds a locale-conditional key, this test fails until the handler is verified', () => {
    // This is a guard-test, not behavior. It deliberately fails the moment any
    // RuntimeFeatureKey becomes locale-conditional, forcing the implementer to
    // update tests/app/runtime-feature-locale-recompute.test.tsx with a real
    // recompute assertion using the new key.
    for (const key of RUNTIME_FEATURE_KEYS) {
      expect(LOCALE_CONDITIONAL_FEATURE_KEYS.has(key)).toBe(false);
    }
  });

  it('locale change with no locale-conditional features does NOT restart createReadyState', async () => {
    const composition = createTestComposition({ definition: testDefinition });
    const documents: LocaleDocument[] = ['en', 'es'].map(locale => ({
      $formspecLocale: '2.0', url: `urn:test:locale:${locale}`, version: '1.0.0', locale,
      target: { kind: 'definition', url: testDefinition.url },
      strings: { '$form.title': locale === 'es' ? 'Formulario de prueba' : testDefinition.title },
    }));
    composition.definitionSource = { ...composition.definitionSource, getLocaleDocuments: async () => documents };
    const definitionSpy = vi.spyOn(composition.definitionSource, 'getDefinition');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(definitionSpy).toHaveBeenCalledTimes(1);
    });

    const localeButton = await screen.findByRole('button', { name: /español/i });
    await act(async () => { localeButton.click(); });
    await waitFor(() => expect(localeButton.getAttribute('aria-pressed')).toBe('true'));

    // No restart → no second getDefinition call.
    expect(definitionSpy).toHaveBeenCalledTimes(1);
  });
});
