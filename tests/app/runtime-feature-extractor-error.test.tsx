import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('FormRuntimePolicyExtractor exceptions become typed RuntimePolicyError', () => {
  afterEach(() => {
    cleanup();
  });
  it('routes adopter-thrown extractor errors to the form-load boundary as InvalidRuntimePolicy', async () => {
    const composition = createTestComposition({ definition: testDefinition });
    composition.formRuntimePolicyExtractor = {
      extract: () => {
        throw new Error('synthetic extractor failure');
      },
    };

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent ?? '').toMatch(/cannot be loaded|unavailable/i);
    });
    expect(screen.getByText(/Support reference/i).textContent).toMatch(/InvalidRuntimePolicy/);
  });

  it('renders the generic copy (not the fileUpload copy) for InvalidRuntimePolicyError — L-5', async () => {
    // InvalidRuntimePolicyError carries NO featureKey. The previous implementation
    // read an untyped `featureKey` off the base RuntimePolicyError; with the typed
    // narrowing in place, the generic copy renders and the fileUpload-specific
    // copy must not appear.
    const composition = createTestComposition({ definition: testDefinition });
    composition.formRuntimePolicyExtractor = {
      extract: () => {
        throw new Error('synthetic extractor failure');
      },
    };

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent ?? '').toMatch(/cannot be loaded/i);
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent ?? '').toContain('requires a capability this site does not currently support');
    expect(alert.textContent ?? '').not.toContain('needs file uploads');
  });
});
