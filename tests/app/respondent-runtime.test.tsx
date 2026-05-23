import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import type { Composition } from '../../src/composition/types.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import type { IdentityClaim, IdentityProvider, IdpOption } from '../../src/ports/identity-provider.ts';
import type {
  ApplicantStatusResource,
  RespondentPlaceSnapshot,
  RespondentSubmissionRecord,
} from '../../src/ports/index.ts';

describe('RespondentRuntime identity sign-in', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
  });

  it('renders explicit OIDC sign-in and loads the form after user action', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider);

    await renderRuntime(composition);
    await waitForText('Sign in to continue');

    expect(identityProvider.authenticate).not.toHaveBeenCalled();

    await clickButton('Sign in with Example IdP');
    await waitForText('Demo Benefits Intake');

    expect(identityProvider.authenticate).toHaveBeenCalledOnce();
    expect(composition.definitionSource.getDefinition).toHaveBeenCalledOnce();
  });

  it('keeps redirect-started as in-progress instead of a load failure', async () => {
    const redirectStarted = new Error('OIDC authentication redirect started');
    redirectStarted.name = 'IdentityInteractionStartedError';
    const identityProvider = new TestIdentityProvider({ error: redirectStarted });

    await renderRuntime(testComposition(identityProvider));
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Opening sign-in');

    expect(text()).not.toContain('We could not load this form.');
    expect(text()).not.toContain('OIDC authentication redirect started');
  });

  it('keeps real OIDC authentication failures visible', async () => {
    const identityProvider = new TestIdentityProvider({ error: new Error('OIDC unavailable') });

    await renderRuntime(testComposition(identityProvider));
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('OIDC unavailable');

    expect(text()).toContain('Sign in to continue');
  });

  it('renders respondent-place history, saved files, and status feedback', async () => {
    const identityProvider = new TestIdentityProvider();
    const applicantStatus: ApplicantStatusResource = {
      event: 'decision-reached',
      occurredAt: '2026-05-24T12:00:00.000Z',
      summary: 'Decision issued. Check your correspondence for next steps.',
    };
    const composition = testComposition(identityProvider, {
      applicantStatus,
      respondentPlace: respondentPlaceSnapshotWithData(),
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Your forms and files');

    expect(text()).toContain('Renew household benefits');
    expect(text()).toContain('Utility bill');
    expect(text()).toContain('Decision Reached');
    expect(text()).toContain('Decision issued. Check your correspondence for next steps.');
    expect(composition.respondentPlaceSource.readPlace).toHaveBeenCalledWith({
      subjectRef: 'oidc:test-subject',
    });
    expect(composition.statusReader.readStatus).toHaveBeenCalledWith(expect.objectContaining({
      resourceRef: 'urn:wos:case_test_0001',
      subjectRef: 'oidc:test-subject',
      submissionId: 'sub-test-0001',
    }));
  });

  it('requests submission status by submission id when a projection has no resource ref', async () => {
    const identityProvider = new TestIdentityProvider();
    const composition = testComposition(identityProvider, {
      applicantStatus: {
        event: 'case-created',
        occurredAt: '2026-05-24T12:00:00.000Z',
        summary: 'Case created.',
      },
      respondentPlace: respondentPlaceSnapshotWithData({
        applicantStatus: {
          sourceSchema: 'https://schemas.formspec.io/wos-api/applicant/v1',
          projectionKind: 'ApplicantStatusTimelineEntry',
          endpoint: 'https://wos.example.test/applicant/cases/case_test_0002',
          updatedAt: '2026-05-24T12:00:00.000Z',
          headline: 'Received',
          summary: 'Your submission was received.',
        },
      }),
    });

    await renderRuntime(composition);
    await waitForText('Sign in to continue');
    await clickButton('Sign in with Example IdP');
    await waitForText('Case Created');

    expect(composition.statusReader.readStatus).toHaveBeenCalledWith(expect.objectContaining({
      resourceRef: undefined,
      subjectRef: 'oidc:test-subject',
      submissionId: 'sub-test-0001',
      trackingUri: 'https://wos.example.test/applicant/cases/case_test_0002',
    }));
  });

  async function renderRuntime(composition: Composition): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    });
  }

  async function clickButton(label: string): Promise<void> {
    const button = Array.from(container?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.includes(label));
    if (!button) {
      throw new Error(`button not found: ${label}`);
    }
    await act(async () => {
      button.click();
      await tick();
    });
  }

  async function waitForText(expected: string, timeoutMs = 2000): Promise<void> {
    const started = Date.now();
    while (!text().includes(expected)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for text: ${expected}\n\n${text()}`);
      }
      await act(async () => {
        await tick();
      });
    }
  }

  function text(): string {
    return container?.textContent ?? '';
  }
});

class TestIdentityProvider implements IdentityProvider {
  readonly authenticate = vi.fn(async (_option: IdpOption): Promise<IdentityClaim> => {
    if (this.error) {
      throw this.error;
    }
    this.current = testClaim();
    for (const listener of this.listeners) {
      listener(this.current);
    }
    return this.current;
  });

  private readonly listeners = new Set<(claim: IdentityClaim | null) => void>();
  private current: IdentityClaim | null = null;

  constructor(private readonly options: { error?: unknown } = {}) {}

  private get error(): unknown {
    return this.options.error;
  }

  async discover(): Promise<IdpOption[]> {
    return [
      {
        kind: 'oidc',
        issuer: 'https://idp.example.test',
        displayName: 'Example IdP',
        minAssurance: 'L2',
      },
    ];
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    this.current = null;
    for (const listener of this.listeners) {
      listener(null);
    }
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}

function testComposition(
  identityProvider: IdentityProvider,
  options: {
    applicantStatus?: ApplicantStatusResource;
    respondentPlace?: RespondentPlaceSnapshot;
  } = {},
): Composition {
  return {
    mode: 'production',
    initialDefinitionUrl: demoSampleForm.url,
    definitionSource: {
      getDefinition: vi.fn(async () => demoSampleForm),
    },
    draftStore: {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
      invalidateSubject: vi.fn(async () => undefined),
    },
    submitTransport: {
      submit: vi.fn(async () => ({
        referenceNumber: 'TEST-0001',
        status: 'accepted' as const,
      })),
    },
    identityProvider,
    respondentPlaceSource: {
      readPlace: vi.fn(async (): Promise<RespondentPlaceSnapshot> => (
        options.respondentPlace ?? emptyRespondentPlaceSnapshot()
      )),
    },
    statusReader: {
      readStatus: vi.fn(async () => options.applicantStatus),
    },
    // ADR-0011: production-mode composition with both seeded capabilities
    // available so the test inherits the pre-policy enablement.
    instanceCapabilities: {
      respondentPlace: 'available',
      status: 'available',
    },
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    },
    getFormRuntimePolicy: () => ({ features: {} }),
  };
}

function emptyRespondentPlaceSnapshot(): RespondentPlaceSnapshot {
  return {
    $formspecRespondentLibrary: '1.0',
    version: '1.0.0',
    libraryId: 'urn:formspec:respondent-library:test',
    subject: {
      subjectRef: 'oidc:test-subject',
      privacyTier: 'pseudonymous',
    },
    aggregationMode: 'client-wallet',
    trustModel: {
      storagePosture: 'client-local-only',
      issuerIsolation: 'per-issuer',
      serverAggregation: 'forbidden',
      presentationDefault: 'explicit-consent',
    },
    obligations: [],
    documents: [],
    submissions: [],
    presentationPolicies: [],
  };
}

function respondentPlaceSnapshotWithData(
  overrides: Partial<RespondentSubmissionRecord> = {},
): RespondentPlaceSnapshot {
  return {
    ...emptyRespondentPlaceSnapshot(),
    obligations: [
      {
        id: 'renew-benefits',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        title: 'Renew household benefits',
        state: 'due',
        dueAt: '2026-06-30T23:59:59.000Z',
      },
    ],
    documents: [
      {
        id: 'doc-proof-address',
        kind: 'proof-of-address',
        displayName: 'Utility bill',
        capturedAt: '2026-05-01T12:00:00.000Z',
        contentRef: {
          uri: 'urn:formspec:blob:sha256:abc123',
          mediaType: 'application/pdf',
          sha256: 'abc123',
        },
      },
    ],
    submissions: [
      {
        id: 'sub-test-0001',
        issuer: {
          name: 'Example Department of Benefits',
          url: 'https://benefits.example.gov',
        },
        definitionRef: {
          url: demoSampleForm.url,
          version: demoSampleForm.version,
        },
        submittedAt: '2026-05-23T12:00:00.000Z',
        applicantStatus: overrides.applicantStatus ?? {
          sourceSchema: 'https://schemas.formspec.io/wos-api/applicant/v1',
          projectionKind: 'ApplicantStatusTimelineEntry',
          resourceRef: 'urn:wos:case_test_0001',
          updatedAt: '2026-05-24T12:00:00.000Z',
          headline: 'Received',
          summary: 'Your submission was received.',
        },
        documentRefs: ['doc-proof-address'],
        ...overrides,
      },
    ],
  };
}

function testClaim(): IdentityClaim {
  return {
    provider: 'https://idp.example.test',
    adapter: 'test-oidc',
    subjectRef: 'oidc:test-subject',
    credentialType: 'oidc-token',
    subjectBinding: 'respondent',
    assuranceLevel: 'L3',
    privacyTier: 'pseudonymous',
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
