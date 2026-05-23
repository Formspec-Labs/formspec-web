import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('getFormRuntimePolicy extractor exceptions become typed RuntimePolicyError', () => {
  it('routes adopter-thrown extractor errors to the form-load boundary as InvalidRuntimePolicy', async () => {
    const composition = createStubComposition();
    composition.getFormRuntimePolicy = () => {
      throw new Error('synthetic extractor failure');
    };

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent ?? '').toMatch(/cannot be loaded|unavailable/i);
    });
    expect(screen.getByText(/Support reference/i).textContent).toMatch(/InvalidRuntimePolicy/);
  });
});
