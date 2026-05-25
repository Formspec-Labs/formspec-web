import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import {
  DEFERRED_CAPABILITY_COPY,
  EMPTY_STATE_COPY,
  NOT_SHARED_ORG_FORBIDDEN_COPY,
  NOT_SHARED_UNAVAILABLE_COPY,
  ObligationsRuntime,
} from '../../src/app/ObligationsRuntime.tsx';
import {
  PARITY_FIXTURE_OBLIGATION,
  renderParityFixture,
} from './obligations-view.test.tsx';
import { EmptyFormRuntimePolicyExtractor } from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import type { Composition } from '../../src/composition/types.ts';
import type {
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../../src/ports/identity-provider.ts';
import type {
  RespondentObligation,
  RespondentPlaceSnapshot,
  RespondentSubmissionRecord,
} from '../../src/ports/index.ts';

describe('ObligationsRuntime (FW-0055 slice 1)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('ready path', () => {
    it('renders the "What you owe" heading + sections grouped by state', async () => {
      const composition = compositionWithObligations([
        obligation({ id: 'a', state: 'due', issuer: { name: 'Alpha' }, title: 'Renew thing', dueAt: '2026-06-01T00:00:00Z' }),
        obligation({ id: 'b', state: 'upcoming', issuer: { name: 'Beta' }, title: 'Send doc' }),
        obligation({ id: 'c', state: 'submitted', issuer: { name: 'Alpha' }, title: 'File form' }),
        obligation({ id: 'd', state: 'overdue', issuer: { name: 'Gamma' }, title: 'Past-due item' }),
      ]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i, level: 1 })).not.toBeNull();
      });

      const dueNow = screen.getByRole('region', { name: /Due now/i });
      expect(within(dueNow).getByText(/Renew thing/)).toBeDefined();
      expect(within(dueNow).getByText(/Past-due item/)).toBeDefined();

      const upcoming = screen.getByRole('region', { name: /^Upcoming$/i });
      expect(within(upcoming).getByText(/Send doc/)).toBeDefined();

      const done = screen.getByRole('region', { name: /^Done$/i });
      expect(within(done).getByText(/File form/)).toBeDefined();
    });

    it('renders the cross-sender header with correct singular/plural', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', issuer: { name: 'Alpha' } }),
        obligation({ id: '2', issuer: { name: 'Alpha' } }),
        obligation({ id: '3', issuer: { name: 'Beta' } }),
      ]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/3 obligations across 2 senders\./)).not.toBeNull();
      });
    });

    it('renders the cross-sender header in the singular form for one obligation, one sender', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', issuer: { name: 'Alpha' } }),
      ]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/1 obligation across 1 sender\./)).not.toBeNull();
      });
    });

    it('renders the deferred-capability copy literally (fixture-pinned)', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', issuer: { name: 'Alpha' } }),
      ]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(DEFERRED_CAPABILITY_COPY)).not.toBeNull();
      });
      const node = screen.getByText(DEFERRED_CAPABILITY_COPY);
      expect(node.textContent).toBe(DEFERRED_CAPABILITY_COPY);
    });

    it('renders the empty-state copy when the snapshot has no obligations', async () => {
      const composition = compositionWithObligations([]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(EMPTY_STATE_COPY)).not.toBeNull();
      });
      // Still shows the deferred-capability honesty copy even when empty.
      expect(screen.getByText(DEFERRED_CAPABILITY_COPY)).toBeDefined();
      // No section regions rendered for empty.
      expect(screen.queryByRole('region', { name: /Due now/i })).toBeNull();
    });

    it('resolves submissionRef to a /status link when the snapshot carries an applicantStatus.resourceRef', async () => {
      const submission: RespondentSubmissionRecord = {
        id: 'sub-1',
        issuer: { name: 'Alpha' },
        definitionRef: { url: 'https://example.test/forms/a', version: '1' },
        submittedAt: '2026-05-01T00:00:00Z',
        applicantStatus: {
          sourceSchema: 'https://schemas.formspec.io/wos-api/applicant/v1',
          projectionKind: 'ApplicantStatusTimelineEntry',
          resourceRef: 'urn:wos:case_demo_0001',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      };
      const composition = compositionWithSnapshot(
        snapshotWith({
          obligations: [obligation({ id: '1', state: 'due', submissionRef: 'sub-1' })],
          submissions: [submission],
        }),
      );

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('link', { name: /Track this application/i })).not.toBeNull();
      });
      const link = screen.getByRole('link', { name: /Track this application/i });
      expect(link.getAttribute('href')).toBe('/status?case=urn%3Awos%3Acase_demo_0001');
    });

    it('does NOT render a /status link when the submissionRef cannot be resolved', async () => {
      const composition = compositionWithSnapshot(
        snapshotWith({
          obligations: [obligation({ id: '1', state: 'due', submissionRef: 'sub-missing' })],
          submissions: [],
        }),
      );

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i, level: 1 })).not.toBeNull();
      });
      expect(screen.queryByRole('link', { name: /Track this application/i })).toBeNull();
    });
  });

  describe('consumer discipline (design §"port boundaries")', () => {
    it('does NOT call StatusReader.readStatus', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', state: 'due' }),
      ]);
      const statusSpy = vi.spyOn(composition.statusReader, 'readStatus');

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i })).not.toBeNull();
      });
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('does NOT call DraftStore / SubmitTransport / DefinitionSource', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', state: 'due' }),
      ]);
      const draftLoadSpy = vi.spyOn(composition.draftStore, 'load');
      const draftSaveSpy = vi.spyOn(composition.draftStore, 'save');
      const submitSpy = vi.spyOn(composition.submitTransport, 'submit');
      const defSpy = vi.spyOn(composition.definitionSource, 'getDefinition');

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i })).not.toBeNull();
      });
      expect(draftLoadSpy).not.toHaveBeenCalled();
      expect(draftSaveSpy).not.toHaveBeenCalled();
      expect(submitSpy).not.toHaveBeenCalled();
      expect(defSpy).not.toHaveBeenCalled();
    });
  });

  describe('vocabulary firewall', () => {
    it('renders no spec / library / sidecar jargon in the DOM', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', state: 'due', issuer: { name: 'Sender Foo' } }),
      ]);

      const { container } = render(
        <ObligationsRuntime composition={composition} config={departmentAppProfile} />,
      );

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i })).not.toBeNull();
      });

      const text = container.textContent ?? '';
      const forbidden = [
        'respondent-place',
        'respondentPlace',
        'RespondentPlace',
        'library',
        'sidecar',
        'snapshot',
        'subjectRef',
        'aggregationMode',
      ];
      for (const term of forbidden) {
        expect(text).not.toContain(term);
      }
    });
  });

  describe('policy-disabled paths', () => {
    it('renders "Obligations are not shared" with the site-unavailable copy when instance-unavailable', async () => {
      const composition = createStubComposition();
      // Switch to production composition with respondentPlace unavailable.
      const productionComposition: Composition = {
        ...composition,
        mode: 'production',
        instanceCapabilities: {
          ...composition.instanceCapabilities,
          respondentPlace: 'unavailable',
          // FW-0056: same slot as respondentPlace under the transitional
          // port mapping; align the declaration so the literal composition
          // would still pass coherence if funneled through freezeComposition.
          documentPresentation: 'unavailable',
        },
        respondentPlaceSource: unavailableRespondentPlaceSource(),
        orgRuntimePolicy: {
          features: {
            respondentPlace: 'allowed',
            status: 'allowed',
            documentPresentation: 'allowed',
          },
        },
        formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor(),
      };
      const readSpy = vi.spyOn(productionComposition.respondentPlaceSource, 'readPlace');

      render(<ObligationsRuntime composition={productionComposition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Obligations are not shared/i)).not.toBeNull();
      });
      expect(screen.getByText(NOT_SHARED_UNAVAILABLE_COPY)).toBeDefined();
      expect(readSpy).not.toHaveBeenCalled();
    });

    it('renders "Obligations are not shared" with the issuer-forbidden copy when org-forbidden', async () => {
      const composition = createStubComposition();
      composition.orgRuntimePolicy = {
        features: { respondentPlace: 'forbidden', status: 'allowed' },
      };
      const readSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Obligations are not shared/i)).not.toBeNull();
      });
      expect(screen.getByText(NOT_SHARED_ORG_FORBIDDEN_COPY)).toBeDefined();
      expect(readSpy).not.toHaveBeenCalled();
    });
  });

  describe('identity', () => {
    it('shows auth-required state when identity discovers options + no boot claim (production OIDC mode)', async () => {
      const identityProvider = new TestIdentityProvider();
      const composition = productionCompositionWithIdentity(identityProvider, [
        obligation({ id: '1', state: 'due' }),
      ]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Sign in to see your obligations/i)).not.toBeNull();
      });
      // Did not call authenticate at boot (no anonymous option to auto-select).
      expect(identityProvider.authenticate).not.toHaveBeenCalled();
    });

    it('proceeds to ready state in demo composition (anonymous boot)', async () => {
      const composition = compositionWithObligations([
        obligation({ id: '1', state: 'due' }),
      ]);

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i })).not.toBeNull();
      });
      // Section is rendered, not the auth screen.
      expect(screen.queryByText(/Sign in to see your obligations/i)).toBeNull();
    });
  });

  describe('DOM parity with shared ObligationItem (MED-3)', () => {
    it('renders the parity-fixture obligation with the same <li> HTML the isolated component produces', async () => {
      const isolatedHtml = renderParityFixture();
      cleanup(); // drop the isolated render before mounting the dashboard.

      const composition = compositionWithObligations([PARITY_FIXTURE_OBLIGATION]);

      const { container } = render(
        <ObligationsRuntime composition={composition} config={departmentAppProfile} />,
      );
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /What you owe/i })).not.toBeNull();
      });

      const li = container.querySelector('li.place-list__item');
      expect(li).not.toBeNull();
      // Parity: the dashboard surface emits the EXACT same `<li>` outerHTML
      // the shared ObligationItem produces in isolation. Locks out drift if a
      // future change inlines custom obligation markup in this surface.
      expect(li!.outerHTML).toBe(isolatedHtml);
    });
  });

  describe('adapter-error path', () => {
    it('renders a friendly error when readPlace throws', async () => {
      const composition = createStubComposition();
      composition.respondentPlaceSource = {
        readPlace: vi.fn(async () => {
          throw new Error('adapter blew up');
        }),
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<ObligationsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/We could not load your obligations/i)).not.toBeNull();
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

describe('ObligationsRuntime copy constants', () => {
  it('DEFERRED_CAPABILITY_COPY is the literal honest-framing string', () => {
    expect(DEFERRED_CAPABILITY_COPY).toBe(
      'Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site.',
    );
  });

  it('EMPTY_STATE_COPY is the literal empty-state string', () => {
    expect(EMPTY_STATE_COPY).toBe('You have no obligations from senders using this site.');
  });

  it('NOT_SHARED_UNAVAILABLE_COPY pins the site-unavailable copy', () => {
    expect(NOT_SHARED_UNAVAILABLE_COPY).toBe('This site does not provide an obligations view.');
  });

  it('NOT_SHARED_ORG_FORBIDDEN_COPY pins the issuer-forbidden copy', () => {
    expect(NOT_SHARED_ORG_FORBIDDEN_COPY).toBe('This sender does not share an obligations view here.');
  });
});

// --- test helpers ---

function obligation(overrides: Partial<RespondentObligation> = {}): RespondentObligation {
  return {
    id: overrides.id ?? 'x',
    issuer: overrides.issuer ?? { name: 'Sender Default' },
    title: overrides.title ?? 'A thing to do',
    state: overrides.state ?? 'upcoming',
    dueAt: overrides.dueAt,
    description: overrides.description,
    formRef: overrides.formRef,
    submissionRef: overrides.submissionRef,
    extensions: overrides.extensions,
  };
}

function snapshotWith(parts: {
  obligations?: RespondentObligation[];
  submissions?: RespondentSubmissionRecord[];
}): RespondentPlaceSnapshot {
  return {
    $formspecRespondentLibrary: '1.0',
    version: '1.0.0',
    libraryId: 'urn:formspec:respondent-library:test',
    subject: { subjectRef: 'respondent:test', privacyTier: 'pseudonymous' },
    aggregationMode: 'client-wallet',
    trustModel: {
      storagePosture: 'client-local-only',
      issuerIsolation: 'per-issuer',
      serverAggregation: 'forbidden',
      presentationDefault: 'explicit-consent',
    },
    obligations: parts.obligations ?? [],
    documents: [],
    submissions: parts.submissions ?? [],
    presentationPolicies: [],
  };
}

function compositionWithObligations(obligations: RespondentObligation[]): Composition {
  return compositionWithSnapshot(snapshotWith({ obligations }));
}

function compositionWithSnapshot(snapshot: RespondentPlaceSnapshot): Composition {
  const composition = createStubComposition();
  composition.respondentPlaceSource = {
    readPlace: vi.fn(async () => snapshot),
  };
  return composition;
}

function productionCompositionWithIdentity(
  identityProvider: IdentityProvider,
  obligations: RespondentObligation[],
): Composition {
  const composition = createStubComposition();
  return {
    ...composition,
    mode: 'production',
    instanceCapabilities: {
      respondentPlace: 'available',
      status: 'available',
      // FW-0056: closed-taxonomy key — declare for resolver input validity.
      documentPresentation: 'available',
      // FW-0033: closed-taxonomy key — declare for resolver input validity.
      fileUpload: 'unavailable',
      // FW-0057: closed-taxonomy key — declare for resolver input validity.
      crossIssuerHistory: 'unavailable',
      // FW-0044: closed-taxonomy key — declare for resolver input validity.
      offlineSubmit: 'unavailable',
      // FW-0027: closed-taxonomy key — declare for resolver input validity.
      payment: 'unavailable',
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
    respondentPlaceSource: {
      readPlace: vi.fn(async () => snapshotWith({ obligations })),
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
