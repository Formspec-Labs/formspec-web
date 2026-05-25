/**
 * ScreenerRuntime tests (FW-0046 slice 1).
 *
 * Asserts the end-to-end happy path against the upstream
 * <FormspecScreener>: load → answer → routed determination view with
 * "these questions, these answers, this reasoning" (J-047 trust load).
 *
 * Also asserts the failure surfaces — no-doc param, not-found URN,
 * adapter throw, and the disabled-by-policy branch — plus the
 * consumer-discipline + vocabulary-firewall invariants.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Pass-through mock for `@formspec-org/engine` so the M1 test can
// override `wasmEvaluateScreenerDocument` for ONE call to prove the
// soft-error path. All other tests get the real implementation via
// `importActual`.
vi.mock('@formspec-org/engine', async () => {
  const actual = await vi.importActual<typeof import('@formspec-org/engine')>(
    '@formspec-org/engine',
  );
  return { ...actual };
});
import * as engineModule from '@formspec-org/engine';
import {
  ScreenerRuntime,
  DEFERRED_CAPABILITY_COPY,
  NOT_SHARED_UNAVAILABLE_COPY,
  NOT_SHARED_ORG_FORBIDDEN_COPY,
  NO_DOC_PARAM_COPY,
  NOT_FOUND_COPY,
  ADAPTER_ERROR_COPY,
  RECOMPUTE_FAILED_COPY,
  ROUTED_REFRESH_LOSS_COPY,
} from '../../src/app/ScreenerRuntime.tsx';
import { stubScreenerDocumentSource } from '../../src/adapters/stub/screener-document-source.ts';
import { unavailableScreenerDocumentSource } from '../../src/adapters/unavailable/screener-document-source.ts';
import {
  demoScreener,
  demoScreenerUrl,
} from '../../src/demo/screener.ts';
import { freezeComposition } from '../../src/policy/index.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../../src/adapters/stub/payment-rail-adapter.ts';
import { stubEmbedTransport } from '../../src/adapters/stub/embed-transport.ts';
import { stubFormRuntimePolicyExtractor } from '../../src/adapters/stub/form-runtime-policy-extractor.ts';
import type { Composition } from '../../src/composition/types.ts';
import type {
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../../src/policy/index.ts';
import type { ScreenerDocumentSource } from '../../src/ports/screener-document-source.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

interface BuildOptions {
  catalog?: ReadonlyArray<typeof demoScreener>;
  screenerSource?: ScreenerDocumentSource;
  screenerAvailability?: 'demo-stub' | 'unavailable';
}

function buildComposition(options: BuildOptions = {}): Composition {
  const screenerSource =
    options.screenerSource
    ?? (options.screenerAvailability === 'unavailable'
      ? unavailableScreenerDocumentSource()
      : stubScreenerDocumentSource(options.catalog ?? [demoScreener]));
  const availability = options.screenerAvailability ?? 'demo-stub';
  const submitTransport = stubSubmitTransport();
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'demo-stub',
    status: 'demo-stub',
    documentPresentation: 'unavailable',
    fileUpload: 'demo-stub',
    crossIssuerHistory: 'demo-stub',
    offlineSubmit: 'demo-stub',
    payment: 'demo-stub',
    embed: 'demo-stub',
    screener: availability,
  };
  const orgRuntimePolicy: OrgRuntimePolicy = {
    features: {
      respondentPlace: 'allowed',
      status: 'allowed',
      documentPresentation: 'allowed',
      fileUpload: 'allowed',
      crossIssuerHistory: 'allowed',
      offlineSubmit: 'allowed',
      payment: 'allowed',
      embed: 'allowed',
      screener: 'allowed',
    },
    limits: { embed: { allowedOrigins: [] } },
  };
  return freezeComposition({
    mode: 'demo',
    initialDefinitionUrl: 'about:not-constructed',
    definitionSource: stubDefinitionSource(),
    draftStore: stubDraftStore(),
    submitTransport,
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(),
    statusReader: stubStatusReader(),
    attachmentStore: stubAttachmentStore(),
    respondentHistorySource: stubRespondentHistorySource(),
    offlineSubmitQueue: stubOfflineSubmitQueue({ transport: submitTransport }),
    paymentRailAdapter: stubPaymentRailAdapter(),
    embedTransport: stubEmbedTransport({ embedded: false }),
    screenerDocumentSource: screenerSource,
    instanceCapabilities,
    orgRuntimePolicy,
    formRuntimePolicyExtractor: stubFormRuntimePolicyExtractor(),
  });
}

function buildOrgForbiddenComposition(): Composition {
  // L4 — exercise the disabled-by-policy branch where the instance has a
  // catalog wired (avoids tripping the coherence-coherence "demo-stub
  // adapter with unavailable declaration" assertion) but the org forbids
  // the screener key. Drives `cause === 'org-forbidden'` so the runtime
  // picks the sender-scoped copy rather than the unavailable copy.
  const composition = buildComposition();
  composition.orgRuntimePolicy = {
    ...composition.orgRuntimePolicy,
    features: {
      ...composition.orgRuntimePolicy.features,
      screener: 'forbidden',
    },
  };
  return composition;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('ScreenerRuntime — load (FW-0046)', () => {
  it('renders the loaded screener heading + intro', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });
    expect(screen.queryByText(/Answer three short questions/i)).not.toBeNull();
  });

  it('renders the not-found copy when the URN is missing from the catalog', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: 'urn:not-in-catalog' }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText(new RegExp(NOT_FOUND_COPY))).not.toBeNull();
    });
  });

  it('renders the no-doc copy when /screener is opened without a URN', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: '' }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText(new RegExp(NO_DOC_PARAM_COPY))).not.toBeNull();
    });
  });

  it('renders the adapter-error copy when readScreener throws a non-NotFound error', async () => {
    // Sub a stub adapter whose readScreener throws — keeps the
    // demo-stub marker the coherence assertion requires.
    const broken = stubScreenerDocumentSource();
    broken.readScreener = async () => {
      throw new Error('catalog transport broke');
    };
    const composition = buildComposition({ screenerSource: broken });
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: 'urn:any' }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText(ADAPTER_ERROR_COPY)).not.toBeNull();
    });
  });
});

describe('ScreenerRuntime — disabled by policy', () => {
  it('renders the "not available" copy when the instance declares screener unavailable', async () => {
    const composition = buildComposition({ screenerAvailability: 'unavailable' });
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText(/Pre-flight routing is not available/i)).not.toBeNull();
    });
    expect(screen.queryByText(NOT_SHARED_UNAVAILABLE_COPY)).not.toBeNull();
  });
});

describe('ScreenerRuntime — answer + reasoning view (J-047 trust load)', () => {
  it('renders the "these questions, these answers, this reasoning" panel after routing', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });

    // Answer each question — organization + check the box + amount.
    const householdSelect = screen.getByLabelText(/Who are you applying for/i) as HTMLSelectElement;
    fireEvent.change(householdSelect, { target: { value: 'organization' } });
    const incomeCheckbox = screen.getByLabelText(/Do you currently have income/i) as HTMLInputElement;
    fireEvent.click(incomeCheckbox);
    const amountField = screen.getByLabelText(/About how much help do you need/i) as HTMLInputElement;
    fireEvent.change(amountField, { target: { value: '5000' } });

    // Submit
    const submit = screen.getByRole('button', { name: /Find my form/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    // Determination view appears
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Here is the form for you/i, level: 1 }),
      ).not.toBeNull();
    });

    // "What we asked" section names all three questions and their answers
    expect(screen.queryByRole('heading', { name: 'What we asked' })).not.toBeNull();
    expect(screen.queryByText('Who are you applying for?')).not.toBeNull();
    expect(screen.queryByText(/An organization or business/)).not.toBeNull();
    expect(screen.queryByText('Do you currently have income from a job or benefits?')).not.toBeNull();
    expect(screen.queryByText('Yes')).not.toBeNull();
    expect(screen.queryByText('About how much help do you need?')).not.toBeNull();
    // Money formatting renders the USD amount.
    expect(screen.queryByText(/\$5,000/)).not.toBeNull();

    // "Why this form" section renders the matched route's reasoning message
    expect(screen.queryByRole('heading', { name: 'Why this form' })).not.toBeNull();
    expect(
      screen.queryByText(
        /You need the grant application — it asks about your organization, not your household\./,
      ),
    ).not.toBeNull();

    // Continue-to-form CTA carries the routed target
    const cta = screen.getByTestId('screener-cta');
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toContain('grant-application');
  });

  it('routes the household=family + has-income=false branch to the family benefits form with its reasoning', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });

    const householdSelect = screen.getByLabelText(/Who are you applying for/i) as HTMLSelectElement;
    fireEvent.change(householdSelect, { target: { value: 'family' } });
    // Click the income checkbox twice: once to set true, again to flip back
    // to false. Leaving it unclicked means "no answer" — the upstream
    // required-check rejects, the route never fires, and the family branch
    // (which requires has_income === false explicitly) doesn't match.
    const incomeCheckbox = screen.getByLabelText(/Do you currently have income/i) as HTMLInputElement;
    fireEvent.click(incomeCheckbox);
    fireEvent.click(incomeCheckbox);
    const amountField = screen.getByLabelText(/About how much help do you need/i) as HTMLInputElement;
    fireEvent.change(amountField, { target: { value: '1200' } });

    const submit = screen.getByRole('button', { name: /Find my form/i });
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Here is the form for you/i, level: 1 }),
      ).not.toBeNull();
    });
    expect(
      screen.queryByText(/You qualify for the family benefits track/i),
    ).not.toBeNull();
    const cta = screen.getByTestId('screener-cta');
    expect(cta.getAttribute('href')).toContain('family-benefits');
  });

  it('exposes eliminated-route reasons on a fan-out strategy screener', async () => {
    // The demo screener uses first-match — by spec, no eliminated
    // routes are surfaced for that strategy. Verify the "How other
    // forms compared" panel renders against a fan-out fixture where
    // eliminations are normative.
    const fanOutScreener = {
      $formspecScreener: '1.0' as const,
      url: 'urn:test:screener:fan-out-demo',
      version: '1.0.0',
      title: 'Fan-out demo',
      items: [
        {
          key: 'pick',
          type: 'field' as const,
          dataType: 'choice' as const,
          label: 'Pick one',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      ],
      binds: [{ path: 'pick', required: 'true' as const }],
      evaluation: [
        {
          id: 'fan',
          strategy: 'fan-out' as const,
          routes: [
            {
              condition: "$pick = 'a'",
              target: 'urn:test:form:a',
              label: 'Form A',
              message: 'You answered A.',
            },
            {
              condition: "$pick = 'b'",
              target: 'urn:test:form:b',
              label: 'Form B',
              message: 'You did not pick B.',
            },
          ],
        },
      ],
    };
    const composition = buildComposition({ catalog: [fanOutScreener] });
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: fanOutScreener.url }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Fan-out demo', level: 1 }),
      ).not.toBeNull();
    });

    const pickSelect = screen.getByLabelText(/Pick one/i) as HTMLSelectElement;
    fireEvent.change(pickSelect, { target: { value: 'a' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check Eligibility|Find my form/i }));
    });

    await waitFor(() => {
      expect(screen.queryByText(/How other forms compared/i)).not.toBeNull();
    });
    expect(screen.queryByText(/You did not pick B/)).not.toBeNull();
  });

  it('lets the respondent restart the screener from the determination view', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });

    const householdSelect = screen.getByLabelText(/Who are you applying for/i) as HTMLSelectElement;
    fireEvent.change(householdSelect, { target: { value: 'organization' } });
    const incomeCheckbox = screen.getByLabelText(/Do you currently have income/i) as HTMLInputElement;
    fireEvent.click(incomeCheckbox);
    const amountField = screen.getByLabelText(/About how much help do you need/i) as HTMLInputElement;
    fireEvent.change(amountField, { target: { value: '5000' } });

    const submit = screen.getByRole('button', { name: /Find my form/i });
    await act(async () => {
      fireEvent.click(submit);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Here is the form for you/i, level: 1 }),
      ).not.toBeNull();
    });
    const restart = screen.getByRole('button', { name: /Answer again/i });
    await act(async () => {
      fireEvent.click(restart);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });
  });
});

describe('ScreenerRuntime — vocabulary firewall (formspec-web CLAUDE.md §Vocabulary firewall)', () => {
  it('does not leak spec / substrate vocabulary into the DOM on the load surface', async () => {
    const composition = buildComposition();
    const { container } = render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });
    const text = container.textContent ?? '';
    for (const forbidden of [
      '$bind',
      'def_id',
      'FEL',
      'COSE',
      'HPKE',
      'Trellis',
      'DeterminationRecord',
      'wasmEvaluate',
      'screenerDocument',
      '$formspec',
      'evaluationBinding',
      'projectionKind',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('does not leak spec / substrate vocabulary into the DOM on the routed determination view', async () => {
    const composition = buildComposition();
    const { container } = render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });
    const householdSelect = screen.getByLabelText(/Who are you applying for/i) as HTMLSelectElement;
    fireEvent.change(householdSelect, { target: { value: 'organization' } });
    const incomeCheckbox = screen.getByLabelText(/Do you currently have income/i) as HTMLInputElement;
    fireEvent.click(incomeCheckbox);
    const amountField = screen.getByLabelText(/About how much help do you need/i) as HTMLInputElement;
    fireEvent.change(amountField, { target: { value: '5000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Find my form/i }));
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Here is the form for you/i, level: 1 }),
      ).not.toBeNull();
    });
    const text = container.textContent ?? '';
    for (const forbidden of [
      '$bind',
      'def_id',
      'FEL',
      'COSE',
      'HPKE',
      'Trellis',
      'DeterminationRecord',
      'PhaseResult',
      'RouteResult',
      'wasmEvaluate',
      'evaluationBinding',
      'condition-false',
      'below-threshold',
      'first-match',
      'fan-out',
      'score-threshold',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('ScreenerRuntime — copy pins (J-047)', () => {
  it('exports the deferred-capability copy as a single pinned string', () => {
    expect(DEFERRED_CAPABILITY_COPY).toBe(
      'Save your answers, sign in to keep them, share a screener result with a caseworker, and screener history are not yet available on this site.',
    );
  });

  it('exports the disabled-cause copy for the unavailable + org-forbidden branches', () => {
    expect(NOT_SHARED_UNAVAILABLE_COPY).toBe('This site does not offer pre-flight routing.');
  });

  it('exports the org-forbidden copy as a distinct sender-scoped string', () => {
    expect(NOT_SHARED_ORG_FORBIDDEN_COPY).toBe(
      'This sender does not offer pre-flight routing here.',
    );
  });

  it('exports the routed-view refresh-loss copy (H1 — names the page-reload consequence)', () => {
    expect(ROUTED_REFRESH_LOSS_COPY).toBe(
      'Reloading this page will lose your answers and start over.',
    );
  });

  it('exports the recompute-failed soft-error copy (M1 — names the degraded mode honestly)', () => {
    expect(RECOMPUTE_FAILED_COPY).toBe(
      "We couldn't generate a summary of why this form was chosen. The form below is still the right one based on your answers.",
    );
  });
});

describe('ScreenerRuntime — refresh-loss disclosure on routed view (H1)', () => {
  it('renders the page-reload consequence in the determination view (not just the load surface)', async () => {
    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });

    // Load surface should NOT carry the refresh-loss copy — it belongs in
    // the routed view where the user is looking AT the determination
    // they're about to lose.
    expect(screen.queryByText(ROUTED_REFRESH_LOSS_COPY)).toBeNull();

    const householdSelect = screen.getByLabelText(/Who are you applying for/i) as HTMLSelectElement;
    fireEvent.change(householdSelect, { target: { value: 'organization' } });
    const incomeCheckbox = screen.getByLabelText(/Do you currently have income/i) as HTMLInputElement;
    fireEvent.click(incomeCheckbox);
    const amountField = screen.getByLabelText(/About how much help do you need/i) as HTMLInputElement;
    fireEvent.change(amountField, { target: { value: '5000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Find my form/i }));
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Here is the form for you/i, level: 1 }),
      ).not.toBeNull();
    });

    expect(screen.queryByText(ROUTED_REFRESH_LOSS_COPY)).not.toBeNull();
    expect(screen.queryByTestId('screener-refresh-loss')).not.toBeNull();
  });
});

describe('ScreenerRuntime — recompute-failed soft-error (M1)', () => {
  it('renders the soft-error copy above the CTA when re-eval throws but the upstream route fired', async () => {
    // Both calls go through `wasmEvaluateScreenerDocument`. We let the
    // upstream's first call succeed, then force the next call (our
    // re-eval pass) to throw, simulating the asymmetric degraded mode.
    let callCount = 0;
    const realEval = engineModule.wasmEvaluateScreenerDocument;
    const spy = vi
      .spyOn(engineModule, 'wasmEvaluateScreenerDocument')
      .mockImplementation((doc, answers) => {
        callCount += 1;
        if (callCount === 1) {
          // Upstream eval — keep the real path so routing fires.
          return realEval(doc, answers);
        }
        throw new Error('wasm panicked on re-eval');
      });

    const composition = buildComposition();
    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });
    const householdSelect = screen.getByLabelText(/Who are you applying for/i) as HTMLSelectElement;
    fireEvent.change(householdSelect, { target: { value: 'organization' } });
    const incomeCheckbox = screen.getByLabelText(/Do you currently have income/i) as HTMLInputElement;
    fireEvent.click(incomeCheckbox);
    const amountField = screen.getByLabelText(/About how much help do you need/i) as HTMLInputElement;
    fireEvent.change(amountField, { target: { value: '5000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Find my form/i }));
    });

    // Soft-error appears in the determination view (not silently
    // collapsing back to the question list).
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Here is the form for you/i, level: 1 }),
      ).not.toBeNull();
    });
    expect(screen.queryByText(RECOMPUTE_FAILED_COPY)).not.toBeNull();
    expect(screen.queryByTestId('screener-recompute-failed')).not.toBeNull();

    // The upstream "Continue to the form" CTA is still rendered — the
    // route fired; we just couldn't reason about it. J-047's "show me
    // my reasoning" trust load is partially served by naming the gap.
    const cta = screen.getByTestId('screener-cta');
    expect(cta.getAttribute('href')).toContain('grant-application');

    // "What we asked" and "Why this form" panels are SUPPRESSED — the
    // reasoning data isn't available, so we don't render an empty panel.
    expect(screen.queryByRole('heading', { name: 'What we asked' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Why this form' })).toBeNull();

    // Refresh-loss copy still renders.
    expect(screen.queryByText(ROUTED_REFRESH_LOSS_COPY)).not.toBeNull();

    spy.mockRestore();
  });
});

describe('ScreenerRuntime — disabled-by-policy org-forbidden branch (L4)', () => {
  it('renders the sender-scoped "not offered here" copy when the org forbids the screener key', async () => {
    // Vocabulary firewall — assert the copy renders AND that the
    // forbidden substrings stay off the DOM on this branch.
    const composition = buildOrgForbiddenComposition();
    const { container } = render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText(NOT_SHARED_ORG_FORBIDDEN_COPY)).not.toBeNull();
    });
    expect(screen.queryByText(/Pre-flight routing is not available/i)).not.toBeNull();
    // Unavailable copy must NOT also render on this branch.
    expect(screen.queryByText(NOT_SHARED_UNAVAILABLE_COPY)).toBeNull();

    const text = container.textContent ?? '';
    for (const forbidden of [
      '$bind',
      'def_id',
      'FEL',
      'COSE',
      'HPKE',
      'Trellis',
      'DeterminationRecord',
      'wasmEvaluate',
      'screenerDocument',
      '$formspec',
      'org-forbidden',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('ScreenerRuntime — consumer discipline (FW-0046)', () => {
  it('does NOT call DefinitionSource, DraftStore, SubmitTransport, StatusReader, IdentityProvider, RespondentPlaceSource, RespondentHistorySource, AttachmentStore, OfflineSubmitQueue, PaymentRailAdapter, or EmbedTransport', async () => {
    const composition = buildComposition();
    const getDef = vi.spyOn(composition.definitionSource, 'getDefinition');
    const loadDraft = vi.spyOn(composition.draftStore, 'load');
    const saveDraft = vi.spyOn(composition.draftStore, 'save');
    const submit = vi.spyOn(composition.submitTransport, 'submit');
    const readStatus = vi.spyOn(composition.statusReader, 'readStatus');
    const discover = vi.spyOn(composition.identityProvider, 'discover');
    const authenticate = vi.spyOn(composition.identityProvider, 'authenticate');
    const readPlace = vi.spyOn(composition.respondentPlaceSource, 'readPlace');
    const readHistory = vi.spyOn(composition.respondentHistorySource, 'readHistory');
    const upload = vi.spyOn(composition.attachmentStore, 'upload');

    render(
      <ScreenerRuntime
        composition={composition}
        config={departmentAppProfile}
        route={{ docUrl: demoScreenerUrl }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Which form is right for you?', level: 1 }),
      ).not.toBeNull();
    });

    expect(getDef).not.toHaveBeenCalled();
    expect(loadDraft).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(readStatus).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
    expect(readPlace).not.toHaveBeenCalled();
    expect(readHistory).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
