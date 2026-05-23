import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
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
    const composition = createStubComposition();
    const definitionSpy = vi.spyOn(composition.definitionSource, 'getDefinition');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(definitionSpy).toHaveBeenCalledTimes(1);
    });

    // Find any locale button that's not the currently-pressed one and click it.
    const localeButtons = screen.queryAllByRole('button', { pressed: false });
    const localeButton = localeButtons.find((btn) => btn.className.includes('locale-button'));
    if (localeButton) {
      await act(async () => {
        localeButton.click();
      });
    }

    // No restart → no second getDefinition call.
    expect(definitionSpy).toHaveBeenCalledTimes(1);
  });
});
