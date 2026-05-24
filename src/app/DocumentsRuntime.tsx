/**
 * DocumentsRuntime — standalone /documents dashboard (FW-0056 slice 1).
 *
 * Consumes `composition.respondentPlaceSource` + `composition.identityProvider`
 * + `ResolvedRuntimeProfile`. Does NOT call StatusReader (status reached by
 * hyperlink only — not used in slice 1), DraftStore, SubmitTransport, or
 * DefinitionSource.
 *
 * Identity-bound per design §"Why identity-required, not URN-keyed". Synthesizes
 * `form: { features: { respondentPlace: 'optional', documentPresentation: 'optional' } }`
 * at the route boundary (web ADR-0011 §"Non-form surface synthesis" addendum).
 *
 * Selective-presentation action is captured intent only — see
 * DEFERRED_PRESENTATION_COPY. No real VP ceremony ships in slice 1.
 */

import { useEffect, useState } from 'react';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type {
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../ports/identity-provider.ts';
import type {
  RespondentDocumentRecord,
  RespondentPlaceSnapshot,
  RespondentPresentationPolicy,
} from '../ports/index.ts';
import {
  InvalidRuntimePolicyError,
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type DisabledCause,
  type ResolvedRuntimeProfile,
  type RuntimePolicyError,
} from '../policy/index.ts';
import {
  isIdentityInteractionStarted,
  selectBootIdentityOption,
  signInOptionsForIdentityPolicy,
} from './respondent-flow.ts';
import {
  DocumentItemContent,
  groupAndSortDocuments,
  uniqueKindCount,
  type GroupedDocuments,
} from './documents-view.tsx';
import { labelFromToken } from './format.ts';
import type { DocumentsRouteParams } from './documents-route.ts';

interface DocumentsRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  // Reserved for future per-route params; today the documents route takes none.
  // Keeping the prop in the surface so App.tsx route selection mirrors the
  // other narrowed runtimes.
  route?: DocumentsRouteParams;
}

type DocumentsViewState =
  | { kind: 'loading' }
  | {
      kind: 'auth-required';
      options: IdpOption[];
      authenticating: boolean;
      error?: unknown;
    }
  | { kind: 'disabled'; cause: DisabledCause | undefined }
  | { kind: 'policy-error'; error: RuntimePolicyError }
  | {
      kind: 'ready';
      snapshot: RespondentPlaceSnapshot;
      grouped: GroupedDocuments;
    }
  | { kind: 'adapter-error' };

/**
 * Pinned copy — design §"Honest gap copy" + §"Empty-state copy" + §"Disabled
 * cause copy" + §"Selection action — captured intent". Exported so fixture
 * tests can assert the literal strings without rendering the component,
 * matching the FW-0055 NOT_SHARED_* / DEFERRED_CAPABILITY_COPY pattern.
 */
export const DEFERRED_CAPABILITY_COPY =
  'Selective presentation, derived-claim disclosure, per-presentation revocation, retention horizons, and client-side encryption are not yet available on this site.';
export const EMPTY_STATE_COPY = 'You have not saved any documents to this site yet.';
export const NOT_SHARED_UNAVAILABLE_COPY = 'This site does not provide a document library.';
export const NOT_SHARED_ORG_FORBIDDEN_COPY =
  'This sender does not provide a document library here.';
export const DEFERRED_PRESENTATION_COPY =
  'Selective presentation is not yet available on this site. When it lands, this button will share the document with the chosen scope.';

export function DocumentsRuntime({ composition, config }: DocumentsRuntimeProps) {
  const [view, setView] = useState<DocumentsViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setView({ kind: 'loading' });

    let profile: ResolvedRuntimeProfile;
    try {
      profile = resolveRuntimeFeatures({
        mode: composition.mode,
        instance: composition.instanceCapabilities,
        org: composition.orgRuntimePolicy,
        // The /documents route IS the user's opt-in to view the library.
        // Mirror StatusRuntime + ObligationsRuntime synthesis pattern
        // (ADR-0011 §"Non-form surface synthesis" addendum). Both keys
        // stay OPTIONAL — never required — so an unavailable instance or
        // org-forbidden policy falls off via the disabled-cause branches
        // rather than raising a typed error.
        form: {
          features: {
            respondentPlace: 'optional',
            documentPresentation: 'optional',
          },
        },
      });
    } catch (error) {
      const wrapped = isRuntimePolicyError(error)
        ? error
        : new InvalidRuntimePolicyError(
            'org',
            `resolveRuntimeFeatures threw: ${error instanceof Error ? error.message : String(error)}`,
          );
      setView({ kind: 'policy-error', error: wrapped });
      return () => {
        cancelled = true;
      };
    }

    // Document listing is gated on respondentPlace (the library substrate).
    // documentPresentation is reported in `profile.enabled / disabled` but
    // does NOT block listing — slice 1's selection action always renders the
    // deferred-presentation copy regardless of the documentPresentation gate
    // (no real consumer in slice 1).
    if (!profile.enabled.has('respondentPlace')) {
      const cause = profile.disabled.get('respondentPlace')?.cause;
      setView({ kind: 'disabled', cause });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const boot = await bootIdentity(composition.identityProvider);
      if (cancelled) return;

      const signInOptions = signInOptionsForIdentityPolicy({
        options: boot.options,
        identityMode: config.identity.mode,
        runtimeMode: composition.mode,
      });

      if (!boot.claim && signInOptions.length > 0) {
        setView({ kind: 'auth-required', options: signInOptions, authenticating: false });
        unsubscribe = composition.identityProvider.subscribe((nextClaim) => {
          if (nextClaim) {
            void loadDocuments(composition, nextClaim);
          }
        });
        return;
      }

      await loadDocuments(composition, boot.claim);
    })().catch((error: unknown) => {
      if (!cancelled) {
        console.error('DocumentsRuntime: bootstrap failed', error);
        setView({ kind: 'adapter-error' });
      }
    });

    async function loadDocuments(
      comp: Composition,
      claim: IdentityClaim | null,
    ): Promise<void> {
      try {
        const snapshot = await comp.respondentPlaceSource.readPlace({
          subjectRef: claim?.subjectRef,
        });
        if (cancelled) return;
        const grouped = groupAndSortDocuments(snapshot.documents ?? []);
        setView({ kind: 'ready', snapshot, grouped });
      } catch (error) {
        if (cancelled) return;
        console.error('DocumentsRuntime: readPlace failed', error);
        setView({ kind: 'adapter-error' });
      }
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [composition]);

  if (view.kind === 'loading') {
    return (
      <section className="documents-surface" aria-labelledby="documents-title">
        <h1 id="documents-title">Your documents</h1>
        <p role="status">Loading your documents</p>
      </section>
    );
  }

  if (view.kind === 'auth-required') {
    return (
      <DocumentsAuthRequired
        authenticating={view.authenticating}
        error={view.error}
        options={view.options}
        onSignIn={async (option) => {
          setView((current) =>
            current.kind === 'auth-required'
              ? { ...current, authenticating: true, error: undefined }
              : current,
          );
          try {
            await composition.identityProvider.authenticate(option);
          } catch (error) {
            if (isIdentityInteractionStarted(error)) return;
            setView((current) =>
              current.kind === 'auth-required'
                ? { ...current, authenticating: false, error }
                : current,
            );
          }
        }}
      />
    );
  }

  if (view.kind === 'disabled') {
    return <DocumentsNotShared cause={view.cause} />;
  }

  if (view.kind === 'policy-error') {
    return <PolicyErrorPage error={view.error} />;
  }

  if (view.kind === 'adapter-error') {
    return (
      <section className="documents-surface" aria-labelledby="documents-title">
        <h1 id="documents-title">Your documents</h1>
        <p>We could not load your documents. Try again later.</p>
      </section>
    );
  }

  return <ReadyDocuments snapshot={view.snapshot} grouped={view.grouped} />;
}

function ReadyDocuments({
  snapshot,
  grouped,
}: {
  snapshot: RespondentPlaceSnapshot;
  grouped: GroupedDocuments;
}) {
  const documents = snapshot.documents ?? [];
  const total = documents.length;
  const kindCount = uniqueKindCount(documents);
  const policies = snapshot.presentationPolicies ?? [];

  return (
    <section className="documents-surface" aria-labelledby="documents-title">
      <header className="documents-surface__header">
        <h1 id="documents-title">Your documents</h1>
        <p className="documents-surface__count">{crossKindHeader(total, kindCount)}</p>
      </header>

      <p className="documents-surface__deferred">{DEFERRED_CAPABILITY_COPY}</p>

      {total === 0 ? (
        <p className="documents-surface__empty">{EMPTY_STATE_COPY}</p>
      ) : (
        [...grouped.entries()].map(([kind, items]) => (
          <DocumentSection key={kind} kind={kind} items={items} policies={policies} />
        ))
      )}
    </section>
  );
}

function DocumentSection({
  kind,
  items,
  policies,
}: {
  kind: string;
  items: readonly RespondentDocumentRecord[];
  policies: readonly RespondentPresentationPolicy[];
}) {
  const headingId = `documents-section-${kind}`;
  return (
    <section className="documents-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{labelFromToken(kind)}</h2>
      <ul className="documents-section__list">
        {items.map((document) => (
          <DocumentItemWithSelection
            key={document.id}
            document={document}
            policies={policies}
          />
        ))}
      </ul>
    </section>
  );
}

function DocumentItemWithSelection({
  document,
  policies,
}: {
  document: RespondentDocumentRecord;
  policies: readonly RespondentPresentationPolicy[];
}) {
  const [open, setOpen] = useState(false);
  const matchingPolicies = policies.filter(
    (policy) => policy.documentRefs?.includes(document.id) ?? false,
  );
  // Single `<li>` wrapper carries the same `place-list__item` class the
  // shared `DocumentItem` emits, so the DOM-parity test pins both surfaces
  // to the same outer shape. The selection action + disclosure render as
  // siblings inside the same list-item — nesting a second `<li>` here would
  // be a WCAG 1.3.1 violation (axe `listitem` rule: list item without a
  // <ul>/<ol> parent).
  return (
    <li className="place-list__item">
      <DocumentItemContent document={document} />
      <button
        aria-expanded={open}
        className="documents-section__use"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        Use this document…
      </button>
      {open ? (
        <div className="documents-section__use-detail" role="region">
          <p className="documents-section__deferred-presentation">
            {DEFERRED_PRESENTATION_COPY}
          </p>
          {matchingPolicies.length > 0 ? (
            <ul className="documents-section__policy-list">
              {matchingPolicies.map((policy) => (
                <li key={policy.id}>
                  <PolicyScopeLine policy={policy} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PolicyScopeLine({ policy }: { policy: RespondentPresentationPolicy }) {
  const recipient = policy.recipientIssuer?.name;
  // Vocabulary firewall: render the document-facing scope using the same
  // labelFromToken pass the document-kind pill uses; recipient name is the
  // sender-supplied display string. No protocol vocabulary leaks.
  const scopeLabel = labelFromToken(policy.scope);
  if (recipient) {
    return (
      <span>
        Share as <strong>{scopeLabel}</strong> with <strong>{recipient}</strong>
      </span>
    );
  }
  return (
    <span>
      Share as <strong>{scopeLabel}</strong>
    </span>
  );
}

function crossKindHeader(total: number, kindCount: number): string {
  if (total === 0) {
    return 'No documents to show yet.';
  }
  const documentsLabel = `${total} ${total === 1 ? 'document' : 'documents'}`;
  const kindsLabel = `${kindCount} ${kindCount === 1 ? 'kind' : 'kinds'}`;
  return `${documentsLabel} across ${kindsLabel}.`;
}

function DocumentsNotShared({ cause }: { cause: DisabledCause | undefined }) {
  const detail =
    cause === 'org-forbidden' || cause === 'form-forbidden'
      ? NOT_SHARED_ORG_FORBIDDEN_COPY
      : NOT_SHARED_UNAVAILABLE_COPY;
  return (
    <section className="documents-surface" aria-labelledby="documents-title">
      <h1 id="documents-title">Your documents</h1>
      <p>
        <strong>Your documents are not available.</strong> {detail}
      </p>
    </section>
  );
}

function PolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <section className="documents-surface" aria-labelledby="documents-title">
      <h1 id="documents-title">Your documents</h1>
      <p>
        This site's document library is not configured correctly. Contact the
        sender, or try again later.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </section>
  );
}

function DocumentsAuthRequired({
  authenticating,
  error,
  options,
  onSignIn,
}: {
  authenticating: boolean;
  error?: unknown;
  options: IdpOption[];
  onSignIn: (option: IdpOption) => void;
}) {
  return (
    <section className="documents-surface auth-required" aria-labelledby="documents-title">
      <h1 id="documents-title">Your documents</h1>
      <p>Sign in to see your documents.</p>
      <div className="auth-required__actions">
        {options.map((option) => (
          <button
            disabled={authenticating}
            key={idpOptionKey(option)}
            type="button"
            onClick={() => onSignIn(option)}
          >
            {authenticating ? 'Opening sign-in' : `Sign in with ${idpOptionLabel(option)}`}
          </button>
        ))}
      </div>
      {error ? (
        <div className="submit-notice submit-notice--error" role="alert">
          {error instanceof Error
            ? error.message
            : 'Try again. If the problem continues, contact support.'}
        </div>
      ) : null}
    </section>
  );
}

function idpOptionKey(option: IdpOption): string {
  if (option.kind === 'oidc') return `${option.kind}:${option.issuer}`;
  if (option.kind === 'magic-link') return `${option.kind}:${option.channel}`;
  return option.kind;
}

function idpOptionLabel(option: IdpOption): string {
  if (option.kind === 'oidc') return option.displayName;
  if (option.kind === 'magic-link') return option.channel === 'sms' ? 'SMS link' : 'email link';
  return 'anonymous access';
}

async function bootIdentity(
  identityProvider: IdentityProvider,
): Promise<{ claim: IdentityClaim | null; options: IdpOption[] }> {
  const options = await identityProvider.discover();
  const option = selectBootIdentityOption(options);
  return {
    options,
    claim: option ? await identityProvider.authenticate(option) : null,
  };
}
