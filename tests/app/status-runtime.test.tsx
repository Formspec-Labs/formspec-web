import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { StatusRuntime } from '../../src/app/StatusRuntime.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { demoApplicantCaseDetail } from '../../src/demo/respondent-place.ts';
import type { Composition } from '../../src/composition/types.ts';
import type {
  ApplicantCaseDetail,
  ApplicantStatusResource,
} from '../../src/ports/index.ts';

const DEMO_URN = 'urn:wos:case_demo_0001';
const NO_AGGREGATE_COPY = 'Timing for similar applications is not yet available on this site.';
const PER_CASE_HEADER = 'Time since each step on your application';

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
      composition.getFormRuntimePolicy = () => ({ features: {} });
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
