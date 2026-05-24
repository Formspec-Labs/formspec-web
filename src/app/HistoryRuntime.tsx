/**
 * HistoryRuntime — standalone /history dashboard (FW-0057 slice 1).
 *
 * Consumes `composition.respondentHistorySource` + `composition.identityProvider`
 * + `ResolvedRuntimeProfile`. Does NOT call StatusReader, DraftStore,
 * SubmitTransport, DefinitionSource, or RespondentPlaceSource (cross-route
 * status / documents links are presentation-only hyperlinks, not port calls).
 *
 * Identity-bound per design §"Why identity-required". Synthesizes
 * `form: { features: { crossIssuerHistory: 'optional' } }` at the route
 * boundary (web ADR-0011 §"Non-form surface synthesis" addendum).
 */

import { useEffect, useState } from 'react';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type {
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../ports/identity-provider.ts';
import type { HistoryEntry, HistorySnapshot } from '../ports/index.ts';
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
  HistoryEntryItem,
  groupAndSortHistory,
  uniqueIssuerCount,
  type GroupedHistory,
} from './history-view.tsx';
import { labelFromToken } from './format.ts';
import type { HistoryRouteParams } from './history-route.ts';

interface HistoryRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  // Reserved for future per-route params; today the history route takes none.
  route?: HistoryRouteParams;
}

type HistoryViewState =
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
      snapshot: HistorySnapshot;
      grouped: GroupedHistory;
    }
  | { kind: 'adapter-error' };

/**
 * Pinned copy — design §"Honest gap copy" + §"Empty-state copy" + §"Disabled
 * cause copy". Exported so fixture tests can assert the literal strings
 * without rendering the component, matching the FW-0055 / FW-0056 pattern.
 */
export const DEFERRED_CAPABILITY_COPY =
  'Search, filters, calendar export, aggregation across other senders, draft resume, signed-record detail, and deletion are not yet available on this site.';
export const EMPTY_STATE_COPY = 'You have no records to show yet.';
export const NOT_SHARED_UNAVAILABLE_COPY = 'This site does not provide a history view.';
export const NOT_SHARED_ORG_FORBIDDEN_COPY = 'This sender does not provide a history view here.';

export function HistoryRuntime({ composition, config }: HistoryRuntimeProps) {
  const [view, setView] = useState<HistoryViewState>({ kind: 'loading' });

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
        // The /history route IS the user's opt-in to view their history.
        // Mirror StatusRuntime + ObligationsRuntime + DocumentsRuntime
        // synthesis pattern (ADR-0011 §"Non-form surface synthesis"
        // addendum). Stays OPTIONAL — never required — so an unavailable
        // instance or org-forbidden policy falls off via the disabled-cause
        // branches rather than raising a typed error.
        form: { features: { crossIssuerHistory: 'optional' } },
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

    if (!profile.enabled.has('crossIssuerHistory')) {
      const cause = profile.disabled.get('crossIssuerHistory')?.cause;
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
            void loadHistory(composition, nextClaim);
          }
        });
        return;
      }

      await loadHistory(composition, boot.claim);
    })().catch((error: unknown) => {
      if (!cancelled) {
        console.error('HistoryRuntime: bootstrap failed', error);
        setView({ kind: 'adapter-error' });
      }
    });

    async function loadHistory(
      comp: Composition,
      claim: IdentityClaim | null,
    ): Promise<void> {
      try {
        const snapshot = await comp.respondentHistorySource.readHistory({
          subjectRef: claim?.subjectRef,
        });
        if (cancelled) return;
        const grouped = groupAndSortHistory(snapshot.entries ?? []);
        setView({ kind: 'ready', snapshot, grouped });
      } catch (error) {
        if (cancelled) return;
        console.error('HistoryRuntime: readHistory failed', error);
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
      <section className="history-surface" aria-labelledby="history-title">
        <h1 id="history-title">Your history</h1>
        <p role="status">Loading your history</p>
      </section>
    );
  }

  if (view.kind === 'auth-required') {
    return (
      <HistoryAuthRequired
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
    return <HistoryNotShared cause={view.cause} />;
  }

  if (view.kind === 'policy-error') {
    return <PolicyErrorPage error={view.error} />;
  }

  if (view.kind === 'adapter-error') {
    return (
      <section className="history-surface" aria-labelledby="history-title">
        <h1 id="history-title">Your history</h1>
        <p>We could not load your history. Try again later.</p>
      </section>
    );
  }

  return <ReadyHistory snapshot={view.snapshot} grouped={view.grouped} />;
}

function ReadyHistory({
  snapshot,
  grouped,
}: {
  snapshot: HistorySnapshot;
  grouped: GroupedHistory;
}) {
  const entries = snapshot.entries ?? [];
  const total = entries.length;
  const senderCount = uniqueIssuerCount(entries);

  return (
    <section className="history-surface" aria-labelledby="history-title">
      <header className="history-surface__header">
        <h1 id="history-title">Your history</h1>
        <p className="history-surface__count">{crossSenderHeader(total, senderCount)}</p>
      </header>

      <p className="history-surface__deferred">{DEFERRED_CAPABILITY_COPY}</p>

      {total === 0 ? (
        <p className="history-surface__empty">{EMPTY_STATE_COPY}</p>
      ) : (
        [...grouped.entries()].map(([kind, items]) => (
          <HistorySection key={kind} kind={kind} items={items} />
        ))
      )}
    </section>
  );
}

function HistorySection({
  kind,
  items,
}: {
  kind: string;
  items: readonly HistoryEntry[];
}) {
  const headingId = `history-section-${kind}`;
  return (
    <section className="history-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{labelFromToken(kind)}</h2>
      <ul className="history-section__list">
        {items.map((entry) => (
          <HistoryEntryItem key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function crossSenderHeader(total: number, senderCount: number): string {
  if (total === 0) {
    return 'No records to show yet.';
  }
  const recordsLabel = `${total} ${total === 1 ? 'record' : 'records'}`;
  const sendersLabel = `${senderCount} ${senderCount === 1 ? 'sender' : 'senders'}`;
  return `${recordsLabel} across ${sendersLabel}.`;
}

function HistoryNotShared({ cause }: { cause: DisabledCause | undefined }) {
  const detail =
    cause === 'org-forbidden' || cause === 'form-forbidden'
      ? NOT_SHARED_ORG_FORBIDDEN_COPY
      : NOT_SHARED_UNAVAILABLE_COPY;
  return (
    <section className="history-surface" aria-labelledby="history-title">
      <h1 id="history-title">Your history</h1>
      <p>
        <strong>Your history is not available.</strong> {detail}
      </p>
    </section>
  );
}

function PolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <section className="history-surface" aria-labelledby="history-title">
      <h1 id="history-title">Your history</h1>
      <p>
        This site's history view is not configured correctly. Contact the
        sender, or try again later.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </section>
  );
}

function HistoryAuthRequired({
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
    <section className="history-surface auth-required" aria-labelledby="history-title">
      <h1 id="history-title">Your history</h1>
      <p>Sign in to see your history.</p>
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
