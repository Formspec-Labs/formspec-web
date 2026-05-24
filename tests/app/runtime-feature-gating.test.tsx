import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { EmptyFormRuntimePolicyExtractor } from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';

describe('seeded feature gating on ResolvedRuntimeProfile (Codex Finding 2)', () => {
  it('disabled respondentPlace + disabled status -> neither adapter is called and the panel does not render', async () => {
    const composition = createStubComposition();
    // Swap to unavailable adapters + matching declarations, in demo mode so
    // the identity policy gate stays satisfied. Override the form policy so
    // both features resolve to `not-requested` (the resolver's default when
    // form+org are silent on a feature).
    (composition.instanceCapabilities as Record<string, unknown>).respondentPlace = 'unavailable';
    (composition.instanceCapabilities as Record<string, unknown>).status = 'unavailable';
    (composition as { respondentPlaceSource: unknown }).respondentPlaceSource =
      unavailableRespondentPlaceSource();
    (composition as { statusReader: unknown }).statusReader = unavailableStatusReader();
    composition.formRuntimePolicyExtractor = new EmptyFormRuntimePolicyExtractor();
    composition.orgRuntimePolicy = { features: {} };

    const readPlaceSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');
    const readStatusSpy = vi.spyOn(composition.statusReader, 'readStatus');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);

    // Wait until the panel has fully gated off (no h2 header, no loading div).
    // The panel may pass through a loading state during the place-load
    // useEffect before the gate fires; the gated end-state has neither.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Your forms and files/i })).toBeNull();
      expect(screen.queryByText(/Loading your forms and files/i)).toBeNull();
    });

    expect(readPlaceSpy).not.toHaveBeenCalled();
    expect(readStatusSpy).not.toHaveBeenCalled();
  });

  it('enabled respondentPlace + disabled status -> readPlace called, readStatus skipped per submission', async () => {
    const composition = createStubComposition();
    // Stub composition default form policy opts both features in as 'optional'.
    // Force status off at the org layer; respondentPlace stays enabled.
    composition.orgRuntimePolicy = {
      features: { respondentPlace: 'allowed', status: 'forbidden' },
    };

    const readPlaceSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');
    const readStatusSpy = vi.spyOn(composition.statusReader, 'readStatus');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(readPlaceSpy).toHaveBeenCalled();
    });

    // The respondent-place panel renders (respondentPlace enabled), but the
    // per-submission status fetch never fires because the profile disabled status.
    expect(readStatusSpy).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('heading', { name: /Your forms and files/i }).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('all-enabled (default demo) -> readPlace called and the panel renders fully', async () => {
    const composition = createStubComposition();
    const readPlaceSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(readPlaceSpy).toHaveBeenCalled();
    });
    // queryAllByRole tolerates the React-19 strict-mode double-render the
    // surrounding shell can produce; the important assertion is that the panel
    // header appears at least once.
    expect(screen.queryAllByRole('heading', { name: /Your forms and files/i }).length)
      .toBeGreaterThanOrEqual(1);
  });
});
