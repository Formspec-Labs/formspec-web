import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  DEFERRED_CAPABILITY_COPY,
  DEFERRED_PRESENTATION_COPY,
  DocumentsRuntime,
  EMPTY_STATE_COPY,
  NOT_SHARED_ORG_FORBIDDEN_COPY,
  NOT_SHARED_UNAVAILABLE_COPY,
} from '../../src/app/DocumentsRuntime.tsx';
import {
  PARITY_FIXTURE_DOCUMENT,
  renderParityFixture,
} from './documents-view.test.tsx';
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
  RespondentDocumentRecord,
  RespondentPlaceSnapshot,
  RespondentPresentationPolicy,
} from '../../src/ports/index.ts';

describe('DocumentsRuntime (FW-0056 slice 1)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('ready path', () => {
    it('renders the "Your documents" heading + per-kind sections grouped by kind', async () => {
      const composition = compositionWithDocuments([
        doc({ id: 'a', kind: 'identity-proof', displayName: 'Passport' }),
        doc({ id: 'b', kind: 'income-proof', displayName: 'W-2 form' }),
        doc({ id: 'c', kind: 'proof-of-address', displayName: 'Utility bill' }),
        doc({ id: 'd', kind: 'identity-proof', displayName: 'Driver license' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /Your documents/i, level: 1 }),
        ).not.toBeNull();
      });

      const identitySection = screen.getByRole('region', { name: /Identity Proof/i });
      expect(within(identitySection).getByText(/Passport/)).toBeDefined();
      expect(within(identitySection).getByText(/Driver license/)).toBeDefined();

      const incomeSection = screen.getByRole('region', { name: /Income Proof/i });
      expect(within(incomeSection).getByText(/W-2 form/)).toBeDefined();

      const addressSection = screen.getByRole('region', { name: /Proof Of Address/i });
      expect(within(addressSection).getByText(/Utility bill/)).toBeDefined();
    });

    it('renders sections in the closed-taxonomy order (identity-proof before signed-receipt before other)', async () => {
      const composition = compositionWithDocuments([
        doc({ id: 'a', kind: 'other' }),
        doc({ id: 'b', kind: 'signed-receipt' }),
        doc({ id: 'c', kind: 'identity-proof' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your documents/i })).not.toBeNull();
      });

      const sections = screen.getAllByRole('region');
      const order = sections
        .map((s) => s.getAttribute('aria-labelledby'))
        .filter((id): id is string => id?.startsWith('documents-section-') ?? false);
      // Closed-taxonomy order from documents-view.ts: identity-proof first,
      // then signed-receipt, then other.
      expect(order).toEqual([
        'documents-section-identity-proof',
        'documents-section-signed-receipt',
        'documents-section-other',
      ]);
    });

    it('renders the cross-kind header with correct singular/plural', async () => {
      const composition = compositionWithDocuments([
        doc({ id: '1', kind: 'identity-proof' }),
        doc({ id: '2', kind: 'identity-proof' }),
        doc({ id: '3', kind: 'income-proof' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/3 documents across 2 kinds\./)).not.toBeNull();
      });
    });

    it('renders the cross-kind header in singular form for one document, one kind', async () => {
      const composition = compositionWithDocuments([
        doc({ id: '1', kind: 'identity-proof' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/1 document across 1 kind\./)).not.toBeNull();
      });
    });

    it('renders the deferred-capability copy literally (fixture-pinned)', async () => {
      const composition = compositionWithDocuments([
        doc({ id: '1', kind: 'identity-proof' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(DEFERRED_CAPABILITY_COPY)).not.toBeNull();
      });
      const node = screen.getByText(DEFERRED_CAPABILITY_COPY);
      expect(node.textContent).toBe(DEFERRED_CAPABILITY_COPY);
    });

    it('renders the empty-state copy when the snapshot has no documents', async () => {
      const composition = compositionWithDocuments([]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(EMPTY_STATE_COPY)).not.toBeNull();
      });
      // Deferred-capability copy still renders even when empty.
      expect(screen.getByText(DEFERRED_CAPABILITY_COPY)).toBeDefined();
      // No per-kind section regions rendered for empty (the outer surface
      // section is the only labelled region on the page).
      const perKindRegions = screen
        .queryAllByRole('region')
        .filter((s) =>
          s.getAttribute('aria-labelledby')?.startsWith('documents-section-') ?? false,
        );
      expect(perKindRegions).toHaveLength(0);
    });
  });

  describe('selection action (design §"Selection action — captured intent")', () => {
    it('opens a disclosure with the deferred-presentation copy when "Use this document…" is clicked', async () => {
      const composition = compositionWithDocuments([
        doc({ id: 'doc1', kind: 'identity-proof', displayName: 'Passport' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Use this document/i })).not.toBeNull();
      });
      // Closed by default.
      expect(screen.queryByText(DEFERRED_PRESENTATION_COPY)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Use this document/i }));

      expect(screen.getByText(DEFERRED_PRESENTATION_COPY)).toBeDefined();
      // Toggle close.
      fireEvent.click(screen.getByRole('button', { name: /Use this document/i }));
      expect(screen.queryByText(DEFERRED_PRESENTATION_COPY)).toBeNull();
    });

    it('lists matching presentation policies in the disclosure (scope + recipient sender)', async () => {
      const composition = compositionWithSnapshot(
        snapshotWith({
          documents: [doc({ id: 'doc1', kind: 'identity-proof', displayName: 'Passport' })],
          presentationPolicies: [
            policy({
              id: 'p1',
              documentRefs: ['doc1'],
              scope: 'selected-documents',
              recipientIssuer: { name: 'Example Department of Benefits' },
            }),
          ],
        }),
      );

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Use this document/i })).not.toBeNull();
      });
      fireEvent.click(screen.getByRole('button', { name: /Use this document/i }));

      expect(screen.getByText(/Example Department of Benefits/)).toBeDefined();
      // Scope label uses the same labelFromToken pass everything else does.
      // The phrase reads "Share as Selected Documents with Example Department…"
      expect(screen.getByText(/Selected Documents/)).toBeDefined();
    });

    it('renders only the deferred-presentation copy when no policy matches the document', async () => {
      const composition = compositionWithSnapshot(
        snapshotWith({
          documents: [doc({ id: 'doc1', kind: 'identity-proof', displayName: 'Passport' })],
          presentationPolicies: [
            policy({
              id: 'p-other',
              documentRefs: ['some-other-doc'],
              scope: 'selected-documents',
            }),
          ],
        }),
      );

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Use this document/i })).not.toBeNull();
      });
      fireEvent.click(screen.getByRole('button', { name: /Use this document/i }));

      expect(screen.getByText(DEFERRED_PRESENTATION_COPY)).toBeDefined();
      // No policy line.
      expect(screen.queryByText(/Share as/)).toBeNull();
    });
  });

  describe('consumer discipline (design §"Port boundaries")', () => {
    it('does NOT call StatusReader.readStatus', async () => {
      const composition = compositionWithDocuments([doc({ id: '1', kind: 'identity-proof' })]);
      const statusSpy = vi.spyOn(composition.statusReader, 'readStatus');

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your documents/i })).not.toBeNull();
      });
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('does NOT call DraftStore / SubmitTransport / DefinitionSource', async () => {
      const composition = compositionWithDocuments([doc({ id: '1', kind: 'identity-proof' })]);
      const draftLoadSpy = vi.spyOn(composition.draftStore, 'load');
      const draftSaveSpy = vi.spyOn(composition.draftStore, 'save');
      const submitSpy = vi.spyOn(composition.submitTransport, 'submit');
      const defSpy = vi.spyOn(composition.definitionSource, 'getDefinition');

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your documents/i })).not.toBeNull();
      });
      expect(draftLoadSpy).not.toHaveBeenCalled();
      expect(draftSaveSpy).not.toHaveBeenCalled();
      expect(submitSpy).not.toHaveBeenCalled();
      expect(defSpy).not.toHaveBeenCalled();
    });
  });

  describe('vocabulary firewall', () => {
    it('renders no spec / library / sidecar / VP jargon in the DOM', async () => {
      const composition = compositionWithSnapshot(
        snapshotWith({
          documents: [doc({ id: '1', kind: 'identity-proof' })],
          presentationPolicies: [
            policy({
              id: 'p1',
              documentRefs: ['1'],
              scope: 'selected-documents',
              recipientIssuer: { name: 'Sender Foo' },
              protocolHints: ['openid4vp', 'w3c-vc-data-model-2.0'],
            }),
          ],
        }),
      );

      const { container } = render(
        <DocumentsRuntime composition={composition} config={departmentAppProfile} />,
      );

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your documents/i })).not.toBeNull();
      });

      // Open the selection disclosure so its content participates in the
      // vocabulary check.
      fireEvent.click(screen.getByRole('button', { name: /Use this document/i }));

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
        'presentationPolicy',
        'presentation-policy',
        'openid4vp',
        'OpenID4VP',
        'w3c-vc',
        'W3C',
        'vc-data-model',
        'hpke',
        'HPKE',
        'VC ',
      ];
      for (const term of forbidden) {
        expect(text).not.toContain(term);
      }
      // FW-0056 arch-review MED-2: regex guards complement the literal pins.
      // Literals catch today's known leak sources; word-boundary +
      // case-insensitive regexes catch drift (case variants, alt delimiters
      // — 'VC,' / 'VC<' / 'w3c' / 'hpke' embedded in mixed-case prose) that
      // the literals would silently miss. These fire for the same protocol
      // vocabulary the literals pin.
      expect(text).not.toMatch(/\bVC\b/i);
      expect(text).not.toMatch(/\bW3C\b/i);
      expect(text).not.toMatch(/\bHPKE\b/i);
      expect(text).not.toMatch(/\bOpenID4VP\b/i);
    });
  });

  describe('policy-disabled paths', () => {
    it('renders "Your documents are not available" with the site-unavailable copy when instance-unavailable', async () => {
      const composition = createStubComposition();
      const productionComposition: Composition = {
        ...composition,
        mode: 'production',
        instanceCapabilities: {
          ...composition.instanceCapabilities,
          respondentPlace: 'unavailable',
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
        formRuntimePolicyExtractor: { extract: () => ({ features: {} }) },
      };
      const readSpy = vi.spyOn(productionComposition.respondentPlaceSource, 'readPlace');

      render(<DocumentsRuntime composition={productionComposition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Your documents are not available/i)).not.toBeNull();
      });
      expect(screen.getByText(NOT_SHARED_UNAVAILABLE_COPY)).toBeDefined();
      expect(readSpy).not.toHaveBeenCalled();
    });

    it('renders the issuer-forbidden copy when org-forbidden', async () => {
      const composition = createStubComposition();
      composition.orgRuntimePolicy = {
        features: {
          respondentPlace: 'forbidden',
          status: 'allowed',
          documentPresentation: 'allowed',
        },
      };
      const readSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Your documents are not available/i)).not.toBeNull();
      });
      expect(screen.getByText(NOT_SHARED_ORG_FORBIDDEN_COPY)).toBeDefined();
      expect(readSpy).not.toHaveBeenCalled();
    });
  });

  describe('identity', () => {
    it('shows auth-required state when identity discovers options + no boot claim (production OIDC mode)', async () => {
      const identityProvider = new TestIdentityProvider();
      const composition = productionCompositionWithIdentity(identityProvider, [
        doc({ id: '1', kind: 'identity-proof' }),
      ]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/Sign in to see your documents/i)).not.toBeNull();
      });
      // Did not call authenticate at boot.
      expect(identityProvider.authenticate).not.toHaveBeenCalled();
    });

    it('proceeds to ready state in demo composition (anonymous boot)', async () => {
      const composition = compositionWithDocuments([doc({ id: '1', kind: 'identity-proof' })]);

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your documents/i })).not.toBeNull();
      });
      // Section rendered, not auth screen.
      expect(screen.queryByText(/Sign in to see your documents/i)).toBeNull();
    });
  });

  describe('DOM parity with shared DocumentItem', () => {
    it('renders the parity-fixture document with the same inner content the isolated component produces', async () => {
      const isolatedHtml = renderParityFixture();
      cleanup();

      const composition = compositionWithDocuments([PARITY_FIXTURE_DOCUMENT]);

      const { container } = render(
        <DocumentsRuntime composition={composition} config={departmentAppProfile} />,
      );
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Your documents/i })).not.toBeNull();
      });

      const li = container.querySelector('li.place-list__item');
      expect(li).not.toBeNull();
      // Parity: the dashboard surface emits the SAME inner-content prefix the
      // shared DocumentItem produces in isolation. The dashboard <li>
      // additionally appends the "Use this document…" button + disclosure as
      // siblings (per FW-0056 selection-action design); the parity contract is
      // that the inner content (place-list__row + issuer line + uploaded/
      // expires line) is byte-identical. Locks out drift if a future change
      // inlines custom document markup in the dashboard surface.
      const isolatedInner = stripLiWrapper(isolatedHtml);
      const dashboardHtml = li!.outerHTML;
      expect(dashboardHtml.startsWith(`<li class="place-list__item">${isolatedInner}`)).toBe(
        true,
      );
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

      render(<DocumentsRuntime composition={composition} config={departmentAppProfile} />);

      await waitFor(() => {
        expect(screen.queryByText(/We could not load your documents/i)).not.toBeNull();
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

describe('DocumentsRuntime copy constants', () => {
  it('DEFERRED_CAPABILITY_COPY pins the honest-framing string', () => {
    expect(DEFERRED_CAPABILITY_COPY).toBe(
      'Selective presentation, derived-claim disclosure, per-presentation revocation, retention horizons, and client-side encryption are not yet available on this site.',
    );
  });

  it('EMPTY_STATE_COPY pins the empty-state string', () => {
    expect(EMPTY_STATE_COPY).toBe('You have not saved any documents to this site yet.');
  });

  it('NOT_SHARED_UNAVAILABLE_COPY pins the site-unavailable copy', () => {
    expect(NOT_SHARED_UNAVAILABLE_COPY).toBe('This site does not provide a document library.');
  });

  it('NOT_SHARED_ORG_FORBIDDEN_COPY pins the issuer-forbidden copy', () => {
    expect(NOT_SHARED_ORG_FORBIDDEN_COPY).toBe(
      'This sender does not provide a document library here.',
    );
  });

  it('DEFERRED_PRESENTATION_COPY pins the selection-action deferred copy', () => {
    expect(DEFERRED_PRESENTATION_COPY).toBe(
      'Selective presentation is not yet available on this site. When it lands, this button will share the document with the chosen scope.',
    );
  });
});

// --- test helpers ---

function stripLiWrapper(liHtml: string): string {
  // Removes the outer `<li class="…">` open + `</li>` close so we can compare
  // inner content prefixes across surfaces that wrap shared content differently.
  return liHtml.replace(/^<li[^>]*>/, '').replace(/<\/li>$/, '');
}

function doc(overrides: Partial<RespondentDocumentRecord> = {}): RespondentDocumentRecord {
  return {
    id: overrides.id ?? 'x',
    kind: overrides.kind ?? 'other',
    displayName: overrides.displayName ?? 'A document',
    issuer: overrides.issuer,
    capturedAt: overrides.capturedAt ?? '2026-05-01T00:00:00.000Z',
    expiresAt: overrides.expiresAt,
    contentRef: overrides.contentRef ?? {
      uri: 'urn:formspec:blob:test',
      mediaType: 'application/octet-stream',
    },
    sourceSubmissionRef: overrides.sourceSubmissionRef,
    presentationPolicyRef: overrides.presentationPolicyRef,
    extensions: overrides.extensions,
  };
}

function policy(overrides: Partial<RespondentPresentationPolicy>): RespondentPresentationPolicy {
  return {
    id: overrides.id ?? 'pol',
    scope: overrides.scope ?? 'selected-documents',
    documentRefs: overrides.documentRefs,
    allowedPurposes: overrides.allowedPurposes ?? ['eligibility'],
    recipientIssuer: overrides.recipientIssuer,
    protocolHints: overrides.protocolHints,
    expiresAt: overrides.expiresAt,
    extensions: overrides.extensions,
  };
}

function snapshotWith(parts: {
  documents?: RespondentDocumentRecord[];
  presentationPolicies?: RespondentPresentationPolicy[];
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
    obligations: [],
    documents: parts.documents ?? [],
    submissions: [],
    presentationPolicies: parts.presentationPolicies ?? [],
  };
}

function compositionWithDocuments(documents: RespondentDocumentRecord[]): Composition {
  return compositionWithSnapshot(snapshotWith({ documents }));
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
  documents: RespondentDocumentRecord[],
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
    },
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
      },
    },
    formRuntimePolicyExtractor: { extract: () => ({ features: {} }) },
    identityProvider,
    respondentPlaceSource: {
      readPlace: vi.fn(async () => snapshotWith({ documents })),
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
