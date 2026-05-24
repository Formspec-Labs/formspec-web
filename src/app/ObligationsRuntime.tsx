/**
 * ObligationsRuntime — standalone /obligations dashboard (FW-0055 slice 1).
 *
 * Consumes `composition.respondentPlaceSource` + `composition.identityProvider`
 * + `ResolvedRuntimeProfile`. Does NOT call StatusReader (status reached by
 * hyperlink to /status), DraftStore, SubmitTransport, or DefinitionSource.
 *
 * Identity-bound per design §"Why identity-required, not URN-keyed". Synthesizes
 * `form: { features: { respondentPlace: 'optional' } }` at the route boundary
 * (web ADR-0011 §"Non-form surface synthesis" addendum, ratified by FW-0039).
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
  RespondentObligation,
  RespondentPlaceSnapshot,
  RespondentSubmissionRecord,
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
  groupAndSortObligations,
  ObligationItem,
  uniqueSenderCount,
  type GroupedObligations,
} from './obligations-view.tsx';
import type { ObligationsRouteParams } from './obligations-route.ts';

interface ObligationsRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  // Reserved for future per-route params; today the obligations route takes none.
  // Keeping the prop in the surface so App.tsx route selection mirrors StatusRuntime.
  route?: ObligationsRouteParams;
}

type ObligationsViewState =
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
      grouped: GroupedObligations;
    }
  | { kind: 'adapter-error' };

/**
 * Pinned copy — design §"Honest gap copy" + §"Empty-state copy" + §"Disabled
 * cause copy". Exported so fixture tests can assert the literal strings without
 * rendering the component, matching the FW-0039 NO_AGGREGATE_COPY pattern.
 */
export const DEFERRED_CAPABILITY_COPY =
  'Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site.';
export const EMPTY_STATE_COPY = 'You have no obligations from senders using this site.';
export const NOT_SHARED_UNAVAILABLE_COPY = 'This site does not provide an obligations view.';
export const NOT_SHARED_ORG_FORBIDDEN_COPY =
  'This sender does not share an obligations view here.';

export function ObligationsRuntime({ composition, config }: ObligationsRuntimeProps) {
  const [view, setView] = useState<ObligationsViewState>({ kind: 'loading' });

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
        // The /obligations route IS the user's opt-in to view obligations.
        // Mirror StatusRuntime's synthesis (ADR-0011 §"Non-form surface
        // synthesis" addendum). Stays OPTIONAL — never required — so an
        // unavailable instance or org-forbidden policy falls off via the
        // disabled-cause branches rather than raising a typed error.
        form: { features: { respondentPlace: 'optional' } },
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
            void loadObligations(composition, nextClaim);
          }
        });
        return;
      }

      await loadObligations(composition, boot.claim);
    })().catch((error: unknown) => {
      if (!cancelled) {
        console.error('ObligationsRuntime: bootstrap failed', error);
        setView({ kind: 'adapter-error' });
      }
    });

    async function loadObligations(
      comp: Composition,
      claim: IdentityClaim | null,
    ): Promise<void> {
      try {
        const snapshot = await comp.respondentPlaceSource.readPlace({
          subjectRef: claim?.subjectRef,
        });
        if (cancelled) return;
        const grouped = groupAndSortObligations(snapshot.obligations ?? []);
        setView({ kind: 'ready', snapshot, grouped });
      } catch (error) {
        if (cancelled) return;
        console.error('ObligationsRuntime: readPlace failed', error);
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
      <section className="obligations-surface" aria-labelledby="obligations-title">
        <h1 id="obligations-title">What you owe</h1>
        <p role="status">Loading your obligations</p>
      </section>
    );
  }

  if (view.kind === 'auth-required') {
    return (
      <ObligationsAuthRequired
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
    return <ObligationsNotShared cause={view.cause} />;
  }

  if (view.kind === 'policy-error') {
    return <PolicyErrorPage error={view.error} />;
  }

  if (view.kind === 'adapter-error') {
    return (
      <section className="obligations-surface" aria-labelledby="obligations-title">
        <h1 id="obligations-title">What you owe</h1>
        <p>We could not load your obligations. Try again later.</p>
      </section>
    );
  }

  return <ReadyObligations snapshot={view.snapshot} grouped={view.grouped} />;
}

function ReadyObligations({
  snapshot,
  grouped,
}: {
  snapshot: RespondentPlaceSnapshot;
  grouped: GroupedObligations;
}) {
  const obligations = snapshot.obligations ?? [];
  const total = obligations.length;
  const senderCount = uniqueSenderCount(obligations);
  const submissionsById = new Map<string, RespondentSubmissionRecord>();
  for (const submission of snapshot.submissions ?? []) {
    submissionsById.set(submission.id, submission);
  }

  return (
    <section className="obligations-surface" aria-labelledby="obligations-title">
      <header className="obligations-surface__header">
        <h1 id="obligations-title">What you owe</h1>
        <p className="obligations-surface__count">{crossSenderHeader(total, senderCount)}</p>
      </header>

      <p className="obligations-surface__deferred">{DEFERRED_CAPABILITY_COPY}</p>

      {total === 0 ? (
        <p className="obligations-surface__empty">{EMPTY_STATE_COPY}</p>
      ) : (
        <>
          <ObligationsSection
            id="due-now"
            title="Due now"
            items={grouped.dueNow}
            submissionsById={submissionsById}
          />
          <ObligationsSection
            id="upcoming"
            title="Upcoming"
            items={grouped.upcoming}
            submissionsById={submissionsById}
          />
          <ObligationsSection
            id="done"
            title="Done"
            items={grouped.done}
            submissionsById={submissionsById}
          />
        </>
      )}
    </section>
  );
}

function ObligationsSection({
  id,
  title,
  items,
  submissionsById,
}: {
  id: string;
  title: string;
  items: readonly RespondentObligation[];
  submissionsById: ReadonlyMap<string, RespondentSubmissionRecord>;
}) {
  if (items.length === 0) return null;
  const headingId = `obligations-section-${id}`;
  return (
    <section className="obligations-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <ul className="obligations-section__list">
        {items.map((obligation) => {
          const link = resolveStatusLink(obligation, submissionsById);
          if (link) {
            return (
              <ObligationItemWithLink
                key={obligation.id}
                obligation={obligation}
                href={link}
              />
            );
          }
          return <ObligationItem key={obligation.id} obligation={obligation} />;
        })}
      </ul>
    </section>
  );
}

function ObligationItemWithLink({
  obligation,
  href,
}: {
  obligation: RespondentObligation;
  href: string;
}) {
  return (
    <li className="place-list__item obligations-section__item--linked">
      <ObligationItem obligation={obligation} />
      <a className="obligations-section__status-link" href={href}>
        Track this application
      </a>
    </li>
  );
}

function resolveStatusLink(
  obligation: RespondentObligation,
  submissionsById: ReadonlyMap<string, RespondentSubmissionRecord>,
): string | undefined {
  const submissionRef = obligation.submissionRef;
  if (!submissionRef) return undefined;
  const submission = submissionsById.get(submissionRef);
  const resourceRef = submission?.applicantStatus?.resourceRef;
  if (!resourceRef) return undefined;
  return `/status?case=${encodeURIComponent(resourceRef)}`;
}

function crossSenderHeader(total: number, senderCount: number): string {
  if (total === 0) {
    return 'No obligations to show yet.';
  }
  const obligationsLabel = `${total} ${total === 1 ? 'obligation' : 'obligations'}`;
  const sendersLabel = `${senderCount} ${senderCount === 1 ? 'sender' : 'senders'}`;
  return `${obligationsLabel} across ${sendersLabel}.`;
}

function ObligationsNotShared({ cause }: { cause: DisabledCause | undefined }) {
  const detail =
    cause === 'org-forbidden' || cause === 'form-forbidden'
      ? NOT_SHARED_ORG_FORBIDDEN_COPY
      : NOT_SHARED_UNAVAILABLE_COPY;
  return (
    <section className="obligations-surface" aria-labelledby="obligations-title">
      <h1 id="obligations-title">What you owe</h1>
      <p>
        <strong>Obligations are not shared.</strong> {detail}
      </p>
    </section>
  );
}

function PolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <section className="obligations-surface" aria-labelledby="obligations-title">
      <h1 id="obligations-title">What you owe</h1>
      <p>
        This site's obligations surface is not configured correctly. Contact the
        sender, or try again later.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </section>
  );
}

function ObligationsAuthRequired({
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
    <section className="obligations-surface auth-required" aria-labelledby="obligations-title">
      <h1 id="obligations-title">What you owe</h1>
      <p>Sign in to see your obligations across senders.</p>
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
          {error instanceof Error ? error.message : 'Try again. If the problem continues, contact support.'}
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
