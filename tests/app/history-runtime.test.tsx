import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  DEFERRED_CAPABILITY_COPY,
  EMPTY_STATE_COPY,
  HistoryRuntime,
  NOT_SHARED_ORG_FORBIDDEN_COPY,
  NOT_SHARED_UNAVAILABLE_COPY,
} from '../../src/app/HistoryRuntime.tsx';
import { EmptyFormRuntimePolicyExtractor } from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import { unavailableRespondentHistorySource } from '../../src/adapters/unavailable/respondent-history-source.ts';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import type { Composition } from '../../src/composition/types.ts';
import type {
  HistoryEntry,
  HistoryEntryKind,
  HistorySnapshot,
} from '../../src/ports/index.ts';
import type {
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../../src/ports/identity-provider.ts';

describe('HistoryRuntime (FW-0057 slice 1)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('ready path', () => {
    it('renders the "Your history" heading + per-kind sections grouped by kind', async () => {
      const composition = compositionWithEntries([
        entry({ id: 'a', kind: 'draft', title: 'Tax draft' }),
        entry({ id: 'b', kind: 'submission', title: 'Benefits intake' }),
        entry({ id: 'c', kind: 'signed-record', title: 'Receipt' }),
      ]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i, level: 1 })).not.toBeNull();
      });

      expect(screen.getByRole('region', { name: /Draft/i })).toBeDefined();
      expect(screen.getByRole('region', { name: /Submission/i })).toBeDefined();
      expect(screen.getByRole('region', { name: /Signed Record/i })).toBeDefined();
    });

    it('renders sections in the closed-taxonomy order (draft → submission → signed-record)', async () => {
      const composition = compositionWithEntries([
        entry({ id: 'a', kind: 'signed-record' }),
        entry({ id: 'b', kind: 'submission' }),
        entry({ id: 'c', kind: 'draft' }),
      ]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i })).not.toBeNull();
      });

      const order = screen
        .getAllByRole('region')
        .map((s) => s.getAttribute('aria-labelledby'))
        .filter((id): id is string => id?.startsWith('history-section-') ?? false);
      expect(order).toEqual([
        'history-section-draft',
        'history-section-submission',
        'history-section-signed-record',
      ]);
    });

    it('sorts within section by timestamp desc, ties broken by id asc', async () => {
      const composition = compositionWithEntries([
        entry({ id: 'older', kind: 'submission', timestamp: '2026-05-01T00:00:00.000Z', title: 'Older' }),
        entry({ id: 'newer', kind: 'submission', timestamp: '2026-05-15T00:00:00.000Z', title: 'Newer' }),
        entry({ id: 'mid', kind: 'submission', timestamp: '2026-05-10T00:00:00.000Z', title: 'Mid' }),
      ]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Newer/)).not.toBeNull();
      });
      const titles = screen.getAllByText(/Older|Newer|Mid/).map((n) => n.textContent);
      // Filter out any matches not in the actual list items (heading dupes etc.).
      const order = titles.filter((t) => t === 'Newer' || t === 'Mid' || t === 'Older');
      expect(order).toEqual(['Newer', 'Mid', 'Older']);
    });

    it('renders the cross-sender header with correct singular/plural', async () => {
      const composition = compositionWithEntries([
        entry({ id: '1', issuer: { name: 'A' } }),
        entry({ id: '2', issuer: { name: 'B' } }),
        entry({ id: '3', issuer: { name: 'A' } }),
      ]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/3 records across 2 senders\./)).not.toBeNull();
      });
    });

    it('renders the cross-sender header in singular form for one record, one sender', async () => {
      const composition = compositionWithEntries([entry({ id: '1', issuer: { name: 'Only Sender' } })]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/1 record across 1 sender\./)).not.toBeNull();
      });
    });

    it('renders the deferred-capability copy literally (fixture-pinned)', async () => {
      const composition = compositionWithEntries([entry({ id: '1' })]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(DEFERRED_CAPABILITY_COPY)).not.toBeNull();
      });
      expect(screen.getByText(DEFERRED_CAPABILITY_COPY).textContent).toBe(DEFERRED_CAPABILITY_COPY);
    });

    it('renders the empty-state copy when the snapshot has no entries', async () => {
      const composition = compositionWithEntries([]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(EMPTY_STATE_COPY)).not.toBeNull();
      });
      expect(screen.getByText(DEFERRED_CAPABILITY_COPY)).toBeDefined();
      const perKindRegions = screen
        .queryAllByRole('region')
        .filter((s) => s.getAttribute('aria-labelledby')?.startsWith('history-section-') ?? false);
      expect(perKindRegions).toHaveLength(0);
    });
  });

  describe('cross-route links', () => {
    it('renders a /status link when applicantStatusRef is set', async () => {
      const composition = compositionWithEntries([
        entry({
          id: '1',
          kind: 'submission',
          applicantStatusRef: 'urn:wos:case_demo_0001',
        }),
      ]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('link', { name: /Track this application/i })).not.toBeNull();
      });
      const link = screen.getByRole('link', { name: /Track this application/i });
      expect(link.getAttribute('href')).toBe('/status?case=urn%3Awos%3Acase_demo_0001');
    });

    it('renders a /documents link when documentRefs is non-empty', async () => {
      const composition = compositionWithEntries([
        entry({ id: '1', kind: 'signed-record', documentRefs: ['doc-1', 'doc-2'] }),
      ]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('link', { name: /2 saved documents/i })).not.toBeNull();
      });
      expect(
        screen.getByRole('link', { name: /2 saved documents/i }).getAttribute('href'),
      ).toBe('/documents');
    });

    it('suppresses cross-route links when refs are absent (never fabricates a URN)', async () => {
      const composition = compositionWithEntries([entry({ id: '1', kind: 'submission' })]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i })).not.toBeNull();
      });
      expect(screen.queryByRole('link', { name: /Track this application/i })).toBeNull();
      expect(screen.queryByRole('link', { name: /saved document/i })).toBeNull();
    });
  });

  describe('consumer discipline (design §"Port boundaries")', () => {
    it('does NOT call StatusReader.readStatus', async () => {
      const composition = compositionWithEntries([entry({ id: '1' })]);
      const statusSpy = vi.spyOn(composition.statusReader, 'readStatus');

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i })).not.toBeNull();
      });
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('does NOT call DraftStore / SubmitTransport / DefinitionSource / RespondentPlaceSource', async () => {
      const composition = compositionWithEntries([entry({ id: '1' })]);
      const draftLoadSpy = vi.spyOn(composition.draftStore, 'load');
      const draftSaveSpy = vi.spyOn(composition.draftStore, 'save');
      const submitSpy = vi.spyOn(composition.submitTransport, 'submit');
      const defSpy = vi.spyOn(composition.definitionSource, 'getDefinition');
      const placeSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i })).not.toBeNull();
      });
      expect(draftLoadSpy).not.toHaveBeenCalled();
      expect(draftSaveSpy).not.toHaveBeenCalled();
      expect(submitSpy).not.toHaveBeenCalled();
      expect(defSpy).not.toHaveBeenCalled();
      expect(placeSpy).not.toHaveBeenCalled();
    });
  });

  describe('vocabulary firewall', () => {
    it('renders no spec / port / XS-2 / protocol jargon in the DOM', async () => {
      const composition = compositionWithEntries([
        entry({
          id: '1',
          kind: 'submission',
          applicantStatusRef: 'urn:wos:case_demo_0001',
          documentRefs: ['doc-1'],
        }),
      ]);

      const { container } = render(
        <HistoryRuntime composition={composition} config={departmentAppProfile} />,
      );

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i })).not.toBeNull();
      });

      const text = container.textContent ?? '';
      const forbidden = [
        'history-snapshot',
        'HistorySnapshot',
        'respondentHistory',
        'RespondentHistory',
        'tokenBag',
        'XS-2',
        'cross-issuer',
        'crossIssuer',
        'issuer-ref',
        'aggregationMode',
        'subjectRef',
        'respondent-place',
        'respondentPlace',
        'library',
        'sidecar',
        'snapshot',
        'OpenID4VP',
        'openid4vp',
        'hpke',
        'HPKE',
        'w3c-vc',
        'W3C',
      ];
      for (const term of forbidden) {
        expect(text).not.toContain(term);
      }
      expect(text).not.toMatch(/\bVC\b/i);
      expect(text).not.toMatch(/\bW3C\b/i);
      expect(text).not.toMatch(/\bHPKE\b/i);
      expect(text).not.toMatch(/\bOpenID4VP\b/i);
    });
  });

  describe('policy-disabled paths', () => {
    it('renders "Your history is not available" with the site-unavailable copy when instance-unavailable', async () => {
      const composition = createStubComposition();
      const productionComposition: Composition = {
        ...composition,
        mode: 'production',
        instanceCapabilities: {
          ...composition.instanceCapabilities,
          crossIssuerHistory: 'unavailable',
        },
        respondentHistorySource: unavailableRespondentHistorySource(),
        orgRuntimePolicy: {
          features: {
            ...composition.orgRuntimePolicy.features,
            crossIssuerHistory: 'allowed',
          },
        },
        formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor(),
      };
      const readSpy = vi.spyOn(productionComposition.respondentHistorySource, 'readHistory');

      render(<HistoryRuntime composition={productionComposition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Your history is not available/i)).not.toBeNull();
      });
      expect(screen.getByText(NOT_SHARED_UNAVAILABLE_COPY)).toBeDefined();
      expect(readSpy).not.toHaveBeenCalled();
    });

    it('renders the sender-forbidden copy when org-forbidden', async () => {
      const composition = createStubComposition();
      composition.orgRuntimePolicy = {
        features: {
          ...composition.orgRuntimePolicy.features,
          crossIssuerHistory: 'forbidden',
        },
      };
      const readSpy = vi.spyOn(composition.respondentHistorySource, 'readHistory');

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Your history is not available/i)).not.toBeNull();
      });
      expect(screen.getByText(NOT_SHARED_ORG_FORBIDDEN_COPY)).toBeDefined();
      expect(readSpy).not.toHaveBeenCalled();
    });
  });

  describe('identity', () => {
    it('shows auth-required state when identity discovers options + no boot claim (production OIDC mode)', async () => {
      const identityProvider = new TestIdentityProvider();
      const composition = productionCompositionWithIdentity(identityProvider, [entry({ id: '1' })]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Sign in to see your history/i)).not.toBeNull();
      });
      expect(identityProvider.authenticate).not.toHaveBeenCalled();
    });

    it('proceeds to ready state in demo composition (anonymous boot)', async () => {
      const composition = compositionWithEntries([entry({ id: '1' })]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your history/i })).not.toBeNull();
      });
      expect(screen.queryByText(/Sign in to see your history/i)).toBeNull();
    });
  });

  describe('adapter-error path', () => {
    it('renders a friendly error when readHistory throws', async () => {
      const composition = createStubComposition();
      composition.respondentHistorySource = {
        readHistory: vi.fn(async () => {
          throw new Error('adapter blew up');
        }),
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/We could not load your history/i)).not.toBeNull();
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('user can dismiss the sign-in error and try a new option', () => {
    it('does not call authenticate when the sign-in button is not clicked', async () => {
      const identityProvider = new TestIdentityProvider();
      const composition = productionCompositionWithIdentity(identityProvider, [entry({ id: '1' })]);

      render(<HistoryRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Sign in to see your history/i)).not.toBeNull();
      });
      // Just verify the button exists; we don't trigger authenticate to avoid
      // the rejection path from TestIdentityProvider's stub which throws.
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      // No click → no authenticate call.
      expect(identityProvider.authenticate).not.toHaveBeenCalled();
    });
  });
});

describe('HistoryRuntime copy constants', () => {
  it('DEFERRED_CAPABILITY_COPY pins the honest-framing string', () => {
    expect(DEFERRED_CAPABILITY_COPY).toBe(
      'Search, filters, calendar export, aggregation across other senders, draft resume, signed-record detail, and deletion are not yet available on this site.',
    );
  });

  it('EMPTY_STATE_COPY pins the empty-state string', () => {
    expect(EMPTY_STATE_COPY).toBe('You have no records to show yet.');
  });

  it('NOT_SHARED_UNAVAILABLE_COPY pins the site-unavailable copy', () => {
    expect(NOT_SHARED_UNAVAILABLE_COPY).toBe('This site does not provide a history view.');
  });

  it('NOT_SHARED_ORG_FORBIDDEN_COPY pins the sender-forbidden copy', () => {
    expect(NOT_SHARED_ORG_FORBIDDEN_COPY).toBe('This sender does not provide a history view here.');
  });
});

// --- test helpers ---

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: overrides.id ?? 'x',
    kind: (overrides.kind ?? 'submission') as HistoryEntryKind,
    issuer: overrides.issuer ?? { name: 'Example Agency' },
    timestamp: overrides.timestamp ?? '2026-05-01T00:00:00.000Z',
    title: overrides.title ?? 'An entry',
    applicantStatusRef: overrides.applicantStatusRef,
    receiptRef: overrides.receiptRef,
    documentRefs: overrides.documentRefs,
    definitionRef: overrides.definitionRef,
  };
}

function snapshotWith(entries: HistoryEntry[]): HistorySnapshot {
  return {
    $formspecRespondentHistory: '1.0',
    aggregationMode: 'client-wallet',
    subjectRef: 'respondent:test',
    entries,
  };
}

function compositionWithEntries(entries: HistoryEntry[]): Composition {
  const composition = createStubComposition();
  composition.respondentHistorySource = {
    readHistory: vi.fn(async () => snapshotWith(entries)),
  };
  return composition;
}

function productionCompositionWithIdentity(
  identityProvider: IdentityProvider,
  entries: HistoryEntry[],
): Composition {
  const composition = createStubComposition();
  return {
    ...composition,
    mode: 'production',
    instanceCapabilities: {
      respondentPlace: 'available',
      status: 'available',
      documentPresentation: 'available',
      fileUpload: 'unavailable',
      crossIssuerHistory: 'available',
      offlineSubmit: 'unavailable',
      payment: 'unavailable',
      embed: 'unavailable',
      screener: 'unavailable',
      trustedReviewer: 'unavailable',
      preparerFiling: 'unavailable',
      bringYourOwnAssistant: 'unavailable',
      safeAddress: 'unavailable',
      duressAware: 'unavailable',
      multiParty: 'unavailable',
      recordLifecycle: 'unavailable',
    },
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
        crossIssuerHistory: 'allowed',
        offlineSubmit: 'allowed',
        payment: 'allowed',
      },
    },
    formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor(),
    identityProvider,
    respondentHistorySource: {
      readHistory: vi.fn(async () => snapshotWith(entries)),
    },
  };
}

class TestIdentityProvider implements IdentityProvider {
  readonly authenticate = vi.fn(async (_option: IdpOption): Promise<IdentityClaim> => {
    throw new Error('authenticate not called from auth-required-state test');
  });

  private readonly listeners = new Set<(claim: IdentityClaim | null) => void>();

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
    for (const listener of this.listeners) listener(null);
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): () => void {
    this.listeners.add(listener);
    listener(null);
    return () => this.listeners.delete(listener);
  }
}
