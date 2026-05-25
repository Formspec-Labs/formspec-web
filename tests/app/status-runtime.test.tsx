import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  StatusRuntime,
  NO_AGGREGATE_COPY,
  PER_CASE_HEADER,
} from '../../src/app/StatusRuntime.tsx';
import { EmptyFormRuntimePolicyExtractor } from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { demoApplicantCaseDetail } from '../../src/demo/respondent-place.ts';
import type { Composition } from '../../src/composition/types.ts';
import type {
  ApplicantCaseDetail,
  ApplicantStatusResource,
  LifecycleActionSnapshot,
} from '../../src/ports/index.ts';
import { unavailableLifecycleActionClient } from '../../src/adapters/unavailable/lifecycle-action-client.ts';

const DEMO_URN = 'urn:wos:case_demo_0001';

describe('StatusRuntime (FW-0039 slice 1)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('ready path with ApplicantCaseDetail', () => {
    let composition: Composition;

    beforeEach(() => {
      composition = createStubComposition();
    });

    it('renders the page heading + 5-stage strip with current step marked', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /Your application status/i, level: 1 }),
        ).not.toBeNull();
      });
      const strip = screen.getByRole('list', { name: /Application stages/i });
      const stages = within(strip).getAllByRole('listitem');
      expect(stages.length).toBe(5);
      expect(stages.map((cell) => cell.textContent)).toEqual(
        expect.arrayContaining(['Received', 'In review', 'Decision drafted', 'Issued', 'Closed']),
      );
      const current = within(strip).getAllByRole('listitem')
        .find((cell) => cell.getAttribute('aria-current') === 'step');
      expect(current).toBeDefined();
    });

    it('renders the per-case timing list with derived durations', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByText(PER_CASE_HEADER)).not.toBeNull();
      });
      // demoApplicantCaseDetail timeline has 1h between case-created and applicant-task-assigned.
      expect(screen.getByText(/1 hour/i)).toBeDefined();
    });

    it('renders the "no aggregate" copy prominently (arch-review F-6)', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByText(NO_AGGREGATE_COPY)).not.toBeNull();
      });
      // Pinned: copy must render literally. Future copy edits must trip this.
      const node = screen.getByText(NO_AGGREGATE_COPY);
      expect(node.textContent).toBe(NO_AGGREGATE_COPY);
    });

    it('renders the AI involvement disclosure when present', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /AI participated in this case/i }),
        ).not.toBeNull();
      });
      expect(screen.getByText(/Eligibility Assistant/)).toBeDefined();
      expect(screen.getByText(/Advisory/)).toBeDefined();
      expect(screen.getByText(/Reviewed by a human: Yes/i)).toBeDefined();
    });

    it('does NOT render the AI disclosure when aiInvolvement is absent', async () => {
      const detail: ApplicantCaseDetail = {
        ...demoApplicantCaseDetail(),
        aiInvolvement: undefined,
      };
      patchStatusReader(composition, DEMO_URN, detail);
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /Your application status/i }),
        ).not.toBeNull();
      });
      expect(
        screen.queryByRole('heading', { name: /AI participated in this case/i }),
      ).toBeNull();
    });

    it('renders the "What you owe next" ribbon when openTasks present', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByText(/What you owe next/i)).not.toBeNull();
      });
      expect(screen.getByText(/Provide additional address proof/)).toBeDefined();
    });

    it('renders FW-0038 lifecycle actions on signed status records', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you can do/i })).not.toBeNull();
      });
      expect(screen.getByRole('button', { name: 'Correct a fact' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Withdraw this submission' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Add a dispute note' })).toBeDefined();
      expect(screen.getByText(/Receipt chain/i)).toBeDefined();
      expect(screen.getByText(/Original submission/i)).toBeDefined();
    });

    it('submits a correction and renders the correction-chain result without raw event vocabulary', async () => {
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Correct a fact' })).not.toBeNull();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Correct a fact' }));
      fireEvent.change(screen.getByLabelText(/Fields to correct/i), {
        target: { value: 'Household size' },
      });
      fireEvent.change(screen.getByLabelText(/^Reason$/i), {
        target: { value: 'I typed the wrong household size.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Submit correction' }));
      await waitFor(() => {
        expect(screen.queryByText(/Correction recorded on the receipt chain/i)).not.toBeNull();
      });
      expect(screen.queryByText(/response\.correction-recorded/i)).toBeNull();
      expect(screen.queryByText(/correctionTargetEventHash/i)).toBeNull();
    });
  });

  describe('not-found path', () => {
    it('renders the unknown-URN copy when the adapter returns undefined', async () => {
      const composition = createStubComposition();
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: 'urn:wos:case_unknown_999' }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByText(/We don't have status for this reference/i),
        ).not.toBeNull();
      });
      expect(screen.queryByText(NO_AGGREGATE_COPY)).toBeNull();
      expect(
        screen.queryByRole('list', { name: /Application stages/i }),
      ).toBeNull();
    });
  });

  describe('policy-disabled paths', () => {
    it('renders "Status not shared" with the issuer-forbidden copy when org-forbidden', async () => {
      const composition = createStubComposition();
      composition.orgRuntimePolicy = {
        features: { respondentPlace: 'allowed', status: 'forbidden' },
      };
      const spy = vi.spyOn(composition.statusReader, 'readStatus');
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByText(/Status not shared/i)).not.toBeNull();
      });
      expect(
        screen.getByText(/This issuer does not share application status here\./i),
      ).toBeDefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('renders "Status not shared" with the site-unavailable copy when instance-unavailable', async () => {
      const composition = createStubComposition();
      (composition.instanceCapabilities as Record<string, unknown>).status = 'unavailable';
      composition.orgRuntimePolicy = {
        features: { respondentPlace: 'allowed', status: 'allowed' },
      };
      composition.formRuntimePolicyExtractor = new EmptyFormRuntimePolicyExtractor();
      const spy = vi.spyOn(composition.statusReader, 'readStatus');
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(screen.queryByText(/Status not shared/i)).not.toBeNull();
      });
      expect(
        screen.getByText(/This site does not provide application status\./i),
      ).toBeDefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('renders lifecycle-unavailable copy without calling the lifecycle adapter when recordLifecycle is unavailable', async () => {
      const composition = createStubComposition();
      (composition.instanceCapabilities as Record<string, unknown>).recordLifecycle = 'unavailable';
      composition.lifecycleActionClient = unavailableLifecycleActionClient();
      const spy = vi.spyOn(composition.lifecycleActionClient, 'readLifecycle');
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByText(/Correction, withdrawal, and dispute are not available on this site/i),
        ).not.toBeNull();
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('identity discipline (arch-review F-9)', () => {
    it('NEVER calls identityProvider.authenticate() or .discover()', async () => {
      const composition = createStubComposition();
      const authenticate = vi.spyOn(composition.identityProvider, 'authenticate');
      const discover = vi.spyOn(composition.identityProvider, 'discover');
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /Your application status/i }),
        ).not.toBeNull();
      });
      expect(authenticate).not.toHaveBeenCalled();
      expect(discover).not.toHaveBeenCalled();
    });
  });

  describe('adapter-error path', () => {
    it('renders a friendly error when readStatus throws', async () => {
      const composition = createStubComposition();
      composition.statusReader = {
        readStatus: vi.fn(async () => {
          throw new Error('adapter blew up');
        }),
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <StatusRuntime
          composition={composition}
          config={departmentAppProfile}
          route={{ caseUrn: DEMO_URN }}
        />,
      );
      await waitFor(() => {
        expect(
          screen.queryByText(/We could not load this status/i),
        ).not.toBeNull();
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

function patchStatusReader(
  composition: Composition,
  urn: string,
  resource: ApplicantStatusResource,
): void {
  composition.statusReader = {
    readStatus: vi.fn(async (req) => (req.resourceRef === urn ? resource : undefined)),
  };
}

describe('StatusRuntime copy constants (code-review F-3)', () => {
  it('NO_AGGREGATE_COPY is the literal honest-framing string', () => {
    expect(NO_AGGREGATE_COPY).toBe(
      'Timing for similar applications is not yet available on this site.',
    );
  });

  it('PER_CASE_HEADER is the literal per-case timing header', () => {
    expect(PER_CASE_HEADER).toBe('Time since each step on your application');
  });
});

describe('StatusRuntime stage mapping (code-review F-4)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lifecycle-changed → completed lights the Closed cell', async () => {
    const composition = createStubComposition();
    const detail: ApplicantCaseDetail = {
      ...demoApplicantCaseDetail(),
      statusTimeline: [
        { event: 'case-created', occurredAt: '2026-05-23T12:00:00.000Z' },
        {
          event: 'lifecycle-changed',
          occurredAt: '2026-06-01T12:00:00.000Z',
          newLifecycleState: 'completed',
        },
      ],
    };
    patchStatusReader(composition, DEMO_URN, detail);
    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: /Application stages/i }),
      ).not.toBeNull();
    });
    const strip = screen.getByRole('list', { name: /Application stages/i });
    const cells = within(strip).getAllByRole('listitem');
    const current = cells.find((cell) => cell.getAttribute('aria-current') === 'step');
    expect(current?.textContent).toBe('Closed');
  });

  it('lifecycle-changed → terminated lights the Closed cell', async () => {
    const composition = createStubComposition();
    const detail: ApplicantCaseDetail = {
      ...demoApplicantCaseDetail(),
      statusTimeline: [
        { event: 'case-created', occurredAt: '2026-05-23T12:00:00.000Z' },
        {
          event: 'lifecycle-changed',
          occurredAt: '2026-06-01T12:00:00.000Z',
          newLifecycleState: 'terminated',
        },
      ],
    };
    patchStatusReader(composition, DEMO_URN, detail);
    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: /Application stages/i }),
      ).not.toBeNull();
    });
    const strip = screen.getByRole('list', { name: /Application stages/i });
    const cells = within(strip).getAllByRole('listitem');
    const current = cells.find((cell) => cell.getAttribute('aria-current') === 'step');
    expect(current?.textContent).toBe('Closed');
  });

  it('decision-reached lights the Issued cell', async () => {
    const composition = createStubComposition();
    const detail: ApplicantCaseDetail = {
      ...demoApplicantCaseDetail(),
      statusTimeline: [
        { event: 'case-created', occurredAt: '2026-05-23T12:00:00.000Z' },
        { event: 'decision-reached', occurredAt: '2026-06-01T12:00:00.000Z' },
      ],
    };
    patchStatusReader(composition, DEMO_URN, detail);
    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: /Application stages/i }),
      ).not.toBeNull();
    });
    const strip = screen.getByRole('list', { name: /Application stages/i });
    const cells = within(strip).getAllByRole('listitem');
    const current = cells.find((cell) => cell.getAttribute('aria-current') === 'step');
    expect(current?.textContent).toBe('Issued');
  });
});

/**
 * Lifecycle badge coverage — `suspended` and `migrating` are transient WOS
 * lifecycle states that previously fell to the default `in-review` stage
 * (independent arch-review N-2). The badge surface renders honest
 * plain-language copy and the pipeline-stage strip keeps showing the stage
 * the case was at BEFORE the transient state.
 */
describe('StatusRuntime lifecycle badge (independent arch-review N-2)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lifecycle-changed → suspended renders the Paused badge and keeps prior stage on the strip', async () => {
    const composition = createStubComposition();
    const detail: ApplicantCaseDetail = {
      ...demoApplicantCaseDetail(),
      statusTimeline: [
        { event: 'case-created', occurredAt: '2026-05-23T12:00:00.000Z' },
        { event: 'applicant-task-submitted', occurredAt: '2026-05-24T12:00:00.000Z' },
        {
          event: 'lifecycle-changed',
          occurredAt: '2026-05-25T12:00:00.000Z',
          newLifecycleState: 'suspended',
        },
      ],
    };
    patchStatusReader(composition, DEMO_URN, detail);
    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: /Application stages/i }),
      ).not.toBeNull();
    });
    // Badge appears with honest "Paused" copy.
    expect(screen.getByText(/^Paused\.$/)).toBeDefined();
    // Vocabulary firewall: raw WOS token MUST NOT leak into user-visible prose.
    expect(screen.queryByText(/suspended/i)).toBeNull();
    // Pipeline stage stays at In review (from applicant-task-submitted),
    // not back at Received.
    const strip = screen.getByRole('list', { name: /Application stages/i });
    const cells = within(strip).getAllByRole('listitem');
    const current = cells.find((cell) => cell.getAttribute('aria-current') === 'step');
    expect(current?.textContent).toBe('In review');
  });

  it('lifecycle-changed → migrating renders the Updating badge and keeps prior stage on the strip', async () => {
    const composition = createStubComposition();
    const detail: ApplicantCaseDetail = {
      ...demoApplicantCaseDetail(),
      statusTimeline: [
        { event: 'case-created', occurredAt: '2026-05-23T12:00:00.000Z' },
        { event: 'applicant-task-submitted', occurredAt: '2026-05-24T12:00:00.000Z' },
        {
          event: 'lifecycle-changed',
          occurredAt: '2026-05-25T12:00:00.000Z',
          newLifecycleState: 'migrating',
        },
      ],
    };
    patchStatusReader(composition, DEMO_URN, detail);
    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: /Application stages/i }),
      ).not.toBeNull();
    });
    // Badge appears with honest "Updating" copy.
    expect(screen.getByText(/^Updating\.$/)).toBeDefined();
    // Vocabulary firewall: raw WOS token MUST NOT leak into user-visible prose.
    expect(screen.queryByText(/migrating/i)).toBeNull();
    // Pipeline stage stays at In review, not Received.
    const strip = screen.getByRole('list', { name: /Application stages/i });
    const cells = within(strip).getAllByRole('listitem');
    const current = cells.find((cell) => cell.getAttribute('aria-current') === 'step');
    expect(current?.textContent).toBe('In review');
  });
});

describe('StatusRuntime lifecycle timeline rendering (FW-0038)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders correction, withdrawal, dispute, and consent-revocation events behind the vocabulary firewall', async () => {
    const composition = createStubComposition();
    const lifecycle: LifecycleActionSnapshot = {
      caseUrn: DEMO_URN,
      actions: [
        { action: 'correct', enabled: true },
        { action: 'withdraw', enabled: true },
        { action: 'dispute', enabled: true, signerOnly: true },
      ],
      events: [
        {
          kind: 'original-submission',
          eventId: 'evt-original',
          occurredAt: '2026-05-23T12:00:00.000Z',
          verified: true,
          title: 'Original signed submission',
        },
        {
          kind: 'correction',
          eventId: 'evt-correction',
          occurredAt: '2026-05-24T12:00:00.000Z',
          verified: true,
          recordedAs: 'correction',
          changedFields: [
            {
              path: '/safeAddress',
              label: 'Protected address',
              originalValue: { text: '123 Private St', accessClass: 'safe-address' },
              correctedValue: { text: '456 Private St', accessClass: 'safe-address' },
            },
          ],
          reason: { text: 'Protected address reason', accessClass: 'safe-address' },
        },
        {
          kind: 'withdrawal',
          eventId: 'evt-withdrawal',
          occurredAt: '2026-05-25T12:00:00.000Z',
          verified: true,
          rescissionRequested: true,
          requiresIssuerAcceptance: true,
        },
        {
          kind: 'dispute',
          eventId: 'evt-dispute',
          occurredAt: '2026-05-25T13:00:00.000Z',
          verified: true,
          statement: { text: 'I dispute this signed record.' },
        },
        {
          kind: 'consent-revocation',
          eventId: 'evt-consent',
          occurredAt: '2026-05-25T14:00:00.000Z',
          verified: true,
          reason: { text: 'I revoke revocable consent.' },
        },
      ],
    };
    composition.lifecycleActionClient = {
      readLifecycle: vi.fn(async () => lifecycle),
      submitCorrection: vi.fn() as never,
      submitWithdrawal: vi.fn() as never,
      submitDispute: vi.fn() as never,
    };

    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText(/Correction recorded/i)).not.toBeNull();
    });
    expect(screen.getByText(/reason withheld/i)).toBeDefined();
    expect(screen.getByText(/value withheld/i)).toBeDefined();
    expect(screen.getByText(/Withdrawal review requested/i)).toBeDefined();
    expect(screen.getByText(/Dispute note added/i)).toBeDefined();
    expect(screen.getByText(/Consent revoked/i)).toBeDefined();
    for (const forbidden of [
      /response\.correction-recorded/i,
      /priorEventHash/i,
      /correctionTargetEventHash/i,
      /supersedes-chain-id/i,
      /applicant-withdrawn/i,
      /prev_hash/i,
      /canonical_event_hash/i,
    ]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });
});

describe('StatusRuntime policy-error path (code-review F-2)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the policy-error page with the typed code when org policy is malformed', async () => {
    const composition = createStubComposition();
    // Inject an org policy with an unknown mode — validateInput throws
    // InvalidRuntimePolicyError before the status decision runs.
    composition.orgRuntimePolicy = {
      features: { respondentPlace: 'allowed', status: 'not-a-real-mode' as never },
    };
    render(
      <StatusRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ caseUrn: DEMO_URN }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText(/not configured correctly/i),
      ).not.toBeNull();
    });
    // The typed RuntimePolicyError code surfaces as the support reference
    // (not the URN, not raw stack). Mirrors the FW-0065 plumbing.
    expect(screen.getByText(/Support reference:/i)).toBeDefined();
  });
});
