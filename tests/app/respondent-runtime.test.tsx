import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import type { Composition } from '../../src/composition/types.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { demoSampleForm } from '../../src/demo/index.ts';
import type { IdentityClaim, IdentityProvider, IdpOption } from '../../src/ports/identity-provider.ts';
import type { RespondentPlaceSnapshot } from '../../src/ports/index.ts';

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

function testComposition(identityProvider: IdentityProvider): Composition {
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
      readPlace: vi.fn(async (): Promise<RespondentPlaceSnapshot> => ({
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
      })),
    },
    statusReader: {
      readStatus: vi.fn(async () => undefined),
    },
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
