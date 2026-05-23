import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('form-load boundary catches RuntimePolicyError', () => {
  it('renders a plain-language unavailable page and surfaces the typed code', async () => {
    const composition = createStubComposition();
    // Force a policy conflict: org requires status; form forbids it.
    composition.orgRuntimePolicy = {
      features: { ...composition.orgRuntimePolicy.features, status: 'required' },
    };
    composition.getFormRuntimePolicy = () => ({ features: { status: 'forbidden' } });

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent ?? '').toMatch(/cannot be loaded|unavailable/i);
    });
    expect(screen.getByText(/Support reference/i).textContent).toMatch(/FeaturePolicyConflict/);
    // No raw stack trace leaked to respondents.
    expect(screen.queryByText(/at Object\./)).toBeNull();
  });
});
