import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createDemoSubmitResponseActions,
  createFormEngine,
  type IFormEngine,
  type ResolvedIssuer,
} from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import {
  FormspecNode,
  FormspecProvider,
  IssuerChromeSlot,
  useFormspecContext,
  type SubmitResult,
} from '@formspec-org/react';
import type {
  FormDefinition,
  ValidationReport,
} from '@formspec-org/types';
import type { FormspecWebConfig, IdentityPolicyConfig } from '../config/types.ts';
import {
  defaultLocaleForDefinition,
  localeOptionsForDefinition,
} from '../demo/locales.ts';
import type { Composition } from '../composition/types.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { ReviewerShare } from '../ports/reviewer-session.ts';
import { respondentSessionToken } from '../ports/reviewer-session.ts';
import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../ports/identity-provider.ts';
import type {
  ApplicantStatusResource,
  RespondentPlaceSnapshot,
  RespondentSubmissionRecord,
} from '../ports/index.ts';
import { ObligationItem } from './obligations-view.tsx';
import { DocumentItem } from './documents-view.tsx';
import { AttachmentStoreProvider } from './AttachmentStoreProvider.tsx';
import { FormspecWebAttachmentControl } from './attachment-upload-control.tsx';
import type { SubmitConfirmation } from '../ports/submit-transport.ts';
import type { NotificationDelivery } from '../ports/notification-delivery.ts';
import type {
  Authorization,
  CaptureReceipt,
  Money,
} from '../ports/payment-rail-adapter.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import { isProblemJson, type ProblemJson } from '../shared/problem-json.ts';
import {
  EmbedOriginNotAllowedError,
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  PaymentRequiresOnlineError,
  UnsupportedRequiredFeatureError,
  anyEnabledFeatureIsLocaleConditional,
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type DisabledCause,
  type ResolvedRuntimeProfile,
  type RuntimePolicyError,
} from '../policy/index.ts';
import { extractPaymentAmount } from '../policy/extract-form-policy.ts';
import { RuntimeProfileProvider } from './RuntimeProfileProvider.tsx';
import { formatDate, labelFromToken, slugToken } from './format.ts';
import {
  assertIdentityPolicySatisfied,
  buildConfirmationTrackingUri,
  buildIntakeHandoff,
  hydrateEngineFromResponse,
  identitySubjectChanged,
  isIdentityInteractionStarted,
  selectBootIdentityOption,
  signInOptionsForIdentityPolicy,
  subjectRefInvalidatedByIdentityChange,
  submitOrQueue,
  submitWithPayment,
  verifyEmbedOriginAllowed,
} from './respondent-flow.ts';
import {
  PUBLIC_TERMINAL_CLEARED_BODY,
  PUBLIC_TERMINAL_CLEARED_TITLE,
  PUBLIC_TERMINAL_SMS_INVALID_COPY,
  PUBLIC_TERMINAL_SMS_SENT_COPY,
  publicTerminalTrackingUrl,
  publicTerminalVerifierCode,
  sendPublicTerminalReceiptSms,
} from './public-terminal-hygiene.ts';
import {
  reviewerDraftRefForDraft,
  reviewerDraftSnapshotForResponse,
  reviewerScopeForPosture,
  reviewerThreadIdForDraft,
  trustedReviewerPolicySnapshot,
} from './trusted-reviewer.ts';

interface RespondentRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
}

const engineReady = initFormspecEngine();

type RespondentState =
  | { status: 'loading' }
  | {
      status: 'auth-required';
      options: IdpOption[];
      authenticating: boolean;
      error?: unknown;
    }
  | {
      status: 'ready';
      definition: FormDefinition;
      engine: IFormEngine;
      draftKey: DraftKey;
      claim: IdentityClaim | null;
      resolvedIssuer: ResolvedIssuer;
      activeLocale: string;
      draftLoaded: boolean;
      runtimeProfile: ResolvedRuntimeProfile;
    }
  | { status: 'terminal-cleared' }
  | { status: 'error'; error: unknown };

type ReadyRespondentState = Extract<RespondentState, { status: 'ready' }>;

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; error: unknown }
  // FW-0044: 'queued' is the offline-routing outcome. The submission was
  // saved locally for replay when the device reconnects; the runtime
  // listens for the window 'online' event and calls
  // `offlineSubmitQueue.replay()` to drain.
  | { status: 'queued'; idempotencyKey: string }
  // FW-0027: payment-orchestration intermediate states. The user sees the
  // distinct phases plainly so a slow rail (Apple Pay confirmation, ACH
  // sleep, etc.) does not look like a frozen "Sending form" screen.
  | { status: 'authorizing-payment'; amount: Money }
  | { status: 'capturing-payment'; authorization: Authorization }
  | { status: 'voiding-payment'; authorization: Authorization }
  // FW-0027: 'payment-voided-after-submit-failure' is the load-bearing
  // user-protection state — surfaced as the "Your form did not submit,
  // and the payment was not charged" copy. Distinct from generic 'error'
  // because the copy must name the released charge explicitly.
  | { status: 'payment-voided-after-submit-failure'; error: unknown }
  // FW-0027: 'capture-failed' is the rare-but-named failure mode — the
  // submit IS in the system, but the rail's settlement queue could not
  // complete the charge. The respondent must be told to contact the sender
  // with their reference number.
  | { status: 'capture-failed'; confirmation: SubmitConfirmation; error: unknown }
  | { status: 'confirmed'; confirmation: SubmitConfirmation; captureReceipt?: CaptureReceipt };

export type TerminalClearState =
  | { status: 'idle' }
  | { status: 'clearing' }
  | { status: 'cleared' }
  | { status: 'error'; error: unknown };

type RespondentPlaceState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | {
      status: 'ready';
      snapshot: RespondentPlaceSnapshot;
      submissionStatuses: Record<string, ApplicantStatusResource>;
      /**
       * If the `status` feature is disabled by policy, the cause records WHY —
       * so SubmissionItem can distinguish "status hasn't been published yet"
       * (status enabled, no record returned) from "status is not shared by
       * this issuer" (status forbidden by org/form). Per arch-review M-3.
       */
      statusDisabledCause: DisabledCause | undefined;
    }
  | { status: 'error'; error: unknown };

export function RespondentRuntime({
  composition,
  config,
}: RespondentRuntimeProps) {
  const [respondentState, setRespondentState] = useState<RespondentState>({ status: 'loading' });
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [respondentPlaceState, setRespondentPlaceState] = useState<RespondentPlaceState>({
    status: 'loading',
  });
  const [terminalClearState, setTerminalClearState] = useState<TerminalClearState>({
    status: 'idle',
  });
  const terminalClearRequestedRef = useRef(false);
  // applyReadyState is constructed inside the bootstrap useEffect (it closes
  // over the cancel/sequence state). Expose it via ref so locale-recompute
  // (ADR-0011 §Resolution) and any future identity-refresh path can reach it
  // without lifting bootstrap state to the render closure.
  const applyReadyStateRef = useRef<
    ((claim: IdentityClaim | null, options?: { locale?: string }) => Promise<void>) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    let engine: IFormEngine | undefined;
    let unsubscribe: (() => void) | undefined;
    let activeClaim: IdentityClaim | null = null;
    let reloadSequence = 0;
    terminalClearRequestedRef.current = false;
    setRespondentState({ status: 'loading' });
    setSubmitState({ status: 'idle' });
    setTerminalClearState({ status: 'idle' });

    const applyReadyState = async (
      claim: IdentityClaim | null,
      options: { locale?: string } = {},
    ): Promise<void> => {
      // applyReadyStateRef set below so render-time callers (handleLocaleChange)
      // can restart this bootstrap when a locale-conditional feature key needs
      // a new ResolvedRuntimeProfile.
      const sequence = ++reloadSequence;
      setRespondentState({ status: 'loading' });
      setSubmitState({ status: 'idle' });
      try {
        await engineReady;
        const readyState = await createReadyState(composition, config, claim, options);

        if (cancelled || sequence !== reloadSequence) {
          readyState.engine.dispose();
          return;
        }

        engine?.dispose();
        engine = readyState.engine;
        activeClaim = claim;
        setRespondentState(readyState);
      } catch (error) {
        if (!cancelled && sequence === reloadSequence) {
          setRespondentState({ status: 'error', error });
        }
      }
    };
    applyReadyStateRef.current = applyReadyState;

    void (async () => {
      const boot = await bootIdentity(composition.identityProvider, 'L1', {
        identityMode: config.identity.mode,
        runtimeMode: composition.mode,
      });
      if (cancelled) {
        return;
      }
      const signInOptions = signInOptionsForIdentityPolicy({
        options: boot.options,
        identityMode: config.identity.mode,
        runtimeMode: composition.mode,
      });
      if (boot.claim || signInOptions.length === 0) {
        await applyReadyState(boot.claim);
        if (cancelled) {
          return;
        }
      } else {
        setRespondentState({
          status: 'auth-required',
          options: signInOptions,
          authenticating: false,
        });
      }
      // Invariant: subscribe's `activeClaim` closure must reflect boot before
      // the listener fires. Without this, a replay-shaped subscribe (e.g.,
      // future OIDC re-hydrate emitting boot.claim) would compare nextClaim
      // to a stale null and trip the subject-changed branch (code review H-1).
      activeClaim = boot.claim;
      unsubscribe = composition.identityProvider.subscribe((nextClaim) => {
        if (terminalClearRequestedRef.current) {
          activeClaim = nextClaim;
          return;
        }
        const invalidatedSubjectRef = subjectRefInvalidatedByIdentityChange(activeClaim, nextClaim);
        if (!identitySubjectChanged(activeClaim, nextClaim)) {
          activeClaim = nextClaim;
          setRespondentState((current) =>
            current.status === 'ready' ? { ...current, claim: nextClaim } : current,
          );
          return;
        }
        void (async () => {
          try {
            if (invalidatedSubjectRef) {
              await composition.draftStore.invalidateSubject(invalidatedSubjectRef);
            }
            await applyReadyState(nextClaim);
          } catch (error) {
            if (!cancelled) {
              setRespondentState({ status: 'error', error });
            }
          }
        })();
      });
    })().catch((error: unknown) => {
      if (!cancelled) {
        setRespondentState({ status: 'error', error });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      engine?.dispose();
      applyReadyStateRef.current = null;
    };
  }, [composition]);

  const placeSubjectRef = respondentState.status === 'ready'
    ? respondentState.claim?.subjectRef ?? respondentState.draftKey.subjectRef
    : undefined;

  const isReady = respondentState.status === 'ready';
  const runtimeProfile = isReady ? respondentState.runtimeProfile : null;

  useEffect(() => {
    if (!isReady || !runtimeProfile) {
      setRespondentPlaceState({ status: 'loading' });
      return;
    }

    // ADR-0011 §Failure Semantics: disabled features render hidden, not as
    // adapter errors. With both seeded features disabled the panel is
    // suppressed entirely; with respondentPlace disabled we don't call the
    // (potentially unavailable) adapter at all.
    if (!runtimeProfile.enabled.has('respondentPlace')) {
      setRespondentPlaceState({ status: 'disabled' });
      return;
    }

    let cancelled = false;
    setRespondentPlaceState({ status: 'loading' });
    void loadRespondentPlace(composition, placeSubjectRef, runtimeProfile)
      .then((state) => {
        if (!cancelled) {
          setRespondentPlaceState(state);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRespondentPlaceState({ status: 'error', error });
        }
      });

    return () => {
      cancelled = true;
    };
    // Narrow deps to the two scalars the effect body actually reads. Keying
    // off whole `respondentState` causes every shallow re-spread (claim
    // refresh, locale change, draft restoration) to refire readPlace —
    // production network amplification per code-review HIGH-1.
  }, [composition, placeSubjectRef, isReady, runtimeProfile]);

  // FW-0044: when the submission is queued, drain on the next `online`
  // event. The queue's `replay()` reuses the original idempotency key
  // (port contract), so the server's same-key contract suppresses any
  // duplicates if the user manually retries. Hook lives BEFORE conditional
  // returns to satisfy React's rules-of-hooks; effect body itself early-
  // returns when not in the 'queued' state.
  //
  // Slice 1 invariant: at most one queued submit per session. The listener
  // keys off the queued idempotency key so intra-callback transitions (e.g.
  // the listener's own `setSubmitState({status:'confirmed'})`) do not tear
  // down the listener mid-flight. FW-0084 multi-tab + any future
  // multi-submit will need explicit fan-out handling here. Mirrors the
  // narrowed-deps pattern at the `placeSubjectRef` effect above.
  const queuedIdempotencyKey =
    submitState.status === 'queued' ? submitState.idempotencyKey : null;
  useEffect(() => {
    if (queuedIdempotencyKey === null) return undefined;
    if (typeof window === 'undefined') return undefined;
    const queuedKey = queuedIdempotencyKey;
    let cancelled = false;
    const onlineListener = (): void => {
      void (async () => {
        try {
          const outcomes = await composition.offlineSubmitQueue.replay();
          if (cancelled) return;
          const sent = outcomes.find(
            (entry) => entry.kind === 'sent' && entry.idempotencyKey === queuedKey,
          );
          if (sent && sent.kind === 'sent') {
            setSubmitState({ status: 'confirmed', confirmation: sent.confirmation });
            return;
          }
          const failed = outcomes.find(
            (entry) => entry.kind === 'failed' && entry.idempotencyKey === queuedKey,
          );
          if (failed && failed.kind === 'failed') {
            setSubmitState({ status: 'error', error: failed.error });
          }
        } catch (error) {
          if (!cancelled) setSubmitState({ status: 'error', error });
        }
      })();
    };
    window.addEventListener('online', onlineListener);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onlineListener);
    };
  }, [queuedIdempotencyKey, composition.offlineSubmitQueue]);

  const handleSignIn = async (option: IdpOption): Promise<void> => {
    setRespondentState((current) =>
      current.status === 'auth-required'
        ? { ...current, authenticating: true, error: undefined }
        : current,
    );
    try {
      await composition.identityProvider.authenticate(option);
    } catch (error) {
      if (isIdentityInteractionStarted(error)) {
        setRespondentState((current) =>
          current.status === 'auth-required'
            ? { ...current, authenticating: true, error: undefined }
            : current,
        );
        return;
      }
      setRespondentState((current) =>
        current.status === 'auth-required'
          ? { ...current, authenticating: false, error }
          : {
              status: 'auth-required',
              options: [option],
              authenticating: false,
              error,
            },
      );
    }
  };

  if (respondentState.status === 'loading') {
    return (
      <div className="submit-notice" role="status">
        Loading form
      </div>
    );
  }

  if (respondentState.status === 'auth-required') {
    return (
      <AuthRequiredSurface
        authenticating={respondentState.authenticating}
        error={respondentState.error}
        options={respondentState.options}
        onSignIn={(option) => {
          void handleSignIn(option);
        }}
      />
    );
  }

  if (respondentState.status === 'error') {
    if (isRuntimePolicyError(respondentState.error)) {
      return <RuntimePolicyErrorPage error={respondentState.error} />;
    }
    return (
      <FriendlyError
        error={respondentState.error}
        headingLevel="h1"
        title="We could not load this form."
      />
    );
  }

  if (respondentState.status === 'terminal-cleared') {
    return <TerminalClearedPanel />;
  }

  const responseActionsDocument = createDemoSubmitResponseActions({
    definitionUrl: respondentState.definition.url,
  });

  const handleLocaleChange = (locale: string): void => {
    if (anyEnabledFeatureIsLocaleConditional(respondentState.runtimeProfile.enabled)) {
      // A future feature ADR registered a locale-conditional key; the resolved
      // profile may differ under the new locale, so restart the form-load
      // boundary per ADR-0011 §Resolution.
      void applyReadyStateRef.current?.(respondentState.claim, { locale });
      return;
    }
    respondentState.engine.setLocale(locale);
    setRespondentState({ ...respondentState, activeLocale: locale });
  };

  const handleSubmit = async (result: SubmitResult): Promise<void> => {
    if (
      submitState.status === 'submitting' ||
      submitState.status === 'confirmed' ||
      submitState.status === 'queued' ||
      submitState.status === 'authorizing-payment' ||
      submitState.status === 'capturing-payment' ||
      submitState.status === 'voiding-payment'
    ) {
      return;
    }

    setSubmitState({ status: 'submitting' });
    try {
      await respondentState.engine.getResolvedIssuer();
      await composition.draftStore.save(respondentState.draftKey, result.response);

      if (result.validationReport && !result.validationReport.valid) {
        setSubmitState({
          status: 'invalid',
          message: validationMessage(result.validationReport),
        });
        return;
      }

      const idempotencyKey = generateIdempotencyKey();
      const completedResponse = respondentState.engine.getResponse({
        id: idempotencyKey,
        profile: 'on-submit',
        author: respondentState.claim
          ? { id: respondentState.claim.subjectRef }
          : undefined,
        subject: respondentState.claim
          ? { id: respondentState.claim.subjectRef, type: 'respondent' }
          : undefined,
      });
      await composition.draftStore.save(respondentState.draftKey, completedResponse);
      const handoff = await buildIntakeHandoff({
        definition: respondentState.definition,
        response: completedResponse,
        validationReport: result.validationReport,
        draftKey: respondentState.draftKey,
        claim: respondentState.claim,
        idempotencyKey,
      });

      const paymentEnabled = respondentState.runtimeProfile.enabled.has('payment');

      if (paymentEnabled) {
        // Offline + payment is hard-rejected at form load by
        // createReadyState (PaymentRequiresOnlineError). By the time we
        // reach submit, the form has already loaded online; no submit-time
        // re-check needed. FW-0101 lifts the restriction post-substrate.

        // Show "Authorizing payment…" panel while authorize runs. The
        // helper resolves to a discriminated outcome that drives the rest
        // of the state machine.
        const amount = extractPaymentAmount(respondentState.definition);
        if (amount) {
          setSubmitState({ status: 'authorizing-payment', amount });
        }
        const paymentOutcome = await submitWithPayment({
          runtimeProfile: respondentState.runtimeProfile,
          definition: respondentState.definition,
          submitTransport: composition.submitTransport,
          paymentRailAdapter: composition.paymentRailAdapter,
          handoff,
          idempotencyKey,
        });
        switch (paymentOutcome.kind) {
          case 'submitted-with-payment':
            setSubmitState({
              status: 'confirmed',
              confirmation: paymentOutcome.confirmation,
              captureReceipt: paymentOutcome.captureReceipt,
            });
            return;
          case 'authorize-failed':
            setSubmitState({ status: 'error', error: paymentOutcome.error });
            return;
          case 'submit-failed-payment-voided':
          case 'void-failed-after-submit-failure':
            setSubmitState({
              status: 'payment-voided-after-submit-failure',
              error:
                paymentOutcome.kind === 'submit-failed-payment-voided'
                  ? paymentOutcome.error
                  : paymentOutcome.submitError,
            });
            return;
          case 'capture-failed':
            setSubmitState({
              status: 'capture-failed',
              confirmation: paymentOutcome.confirmation,
              error: paymentOutcome.error,
            });
            return;
        }
      }

      // FW-0044: free-form path with offline-aware routing (no payment).
      const outcome = await submitOrQueue({
        navigatorOnLine: readNavigatorOnLine(),
        runtimeProfile: respondentState.runtimeProfile,
        submitTransport: composition.submitTransport,
        offlineSubmitQueue: composition.offlineSubmitQueue,
        handoff,
        idempotencyKey,
      });
      if (outcome.kind === 'submitted') {
        setSubmitState({ status: 'confirmed', confirmation: outcome.confirmation });
      } else {
        setSubmitState({
          status: 'queued',
          idempotencyKey: outcome.queuedSubmit.idempotencyKey,
        });
      }
    } catch (error) {
      setSubmitState({ status: 'error', error });
    }
  };

  const handleClearTerminal = async (): Promise<void> => {
    terminalClearRequestedRef.current = true;
    setTerminalClearState({ status: 'clearing' });
    try {
      await composition.draftStore.delete(respondentState.draftKey);
      if (respondentState.claim) {
        await composition.identityProvider.revoke(respondentState.claim);
      }
      setSubmitState({ status: 'idle' });
      setRespondentPlaceState({ status: 'disabled' });
      setTerminalClearState({ status: 'cleared' });
      setRespondentState({ status: 'terminal-cleared' });
    } catch (error) {
      terminalClearRequestedRef.current = false;
      setTerminalClearState({ status: 'error', error });
    }
  };


  return (
    <AppErrorBoundary>
      <RuntimeProfileProvider value={respondentState.runtimeProfile}>
        <AttachmentStoreProvider value={composition.attachmentStore}>
          <FormspecProvider
            engine={respondentState.engine}
            responseActionsDocument={responseActionsDocument}
            components={{ fields: { FileUpload: FormspecWebAttachmentControl } }}
            onSubmit={(result) => {
              void handleSubmit(result);
            }}
          >
            <RespondentSurface
              activeLocale={respondentState.activeLocale}
              brandName={config.brand.name}
              claim={respondentState.claim}
              composition={composition}
              definition={respondentState.definition}
              draftKey={respondentState.draftKey}
              draftLoaded={respondentState.draftLoaded}
              mode={composition.mode}
              respondentPlaceState={respondentPlaceState}
              resolvedIssuer={respondentState.resolvedIssuer}
              runtimeProfile={respondentState.runtimeProfile}
              submitState={submitState}
              terminalClearState={terminalClearState}
              notificationDelivery={composition.notificationDelivery}
              onClearTerminal={handleClearTerminal}
              onLocaleChange={handleLocaleChange}
            />
          </FormspecProvider>
        </AttachmentStoreProvider>
      </RuntimeProfileProvider>
    </AppErrorBoundary>
  );
}

async function bootIdentity(
  identityProvider: IdentityProvider,
  // FW-0028: explicit assurance floor lands the discover() call shape EXT-8
  // will supply the form-side requirement to. Slice 1 passes `'L1'` — the
  // picker filters out nothing today; slice 2 reads the form policy after
  // the form loads and re-discovers with the form's declared floor (the
  // re-discover-after-load flow ships with the FW-0020 step-up surface).
  formAssuranceFloor: AssuranceLevel = 'L1',
  // FW-0028: when the picker policy is going to render >0 options, suppress
  // the boot-time auto-select of anonymous so the user actually sees the
  // picker. Without this gate, anonymous-allowed deployments with mixed
  // options would silently boot anonymous and never reach the picker.
  pickerPolicy?: {
    identityMode: IdentityPolicyConfig['mode'];
    runtimeMode: 'demo' | 'production';
  },
): Promise<{ claim: IdentityClaim | null; options: IdpOption[] }> {
  const options = await identityProvider.discover(formAssuranceFloor);
  const pickerWillRender = pickerPolicy
    ? signInOptionsForIdentityPolicy({ options, ...pickerPolicy }).length > 0
    : false;
  const option = selectBootIdentityOption(options, pickerWillRender);
  return {
    options,
    claim: option ? await identityProvider.authenticate(option) : null,
  };
}

async function createReadyState(
  composition: Composition,
  config: FormspecWebConfig,
  claim: IdentityClaim | null,
  options: { locale?: string } = {},
): Promise<ReadyRespondentState> {
  assertIdentityPolicySatisfied({
    claim,
    identityMode: config.identity.mode,
    runtimeMode: composition.mode,
  });
  const definition = await composition.definitionSource.getDefinition(
    composition.initialDefinitionUrl,
  );
  // ADR-0011 §Resolution: resolve once per (definition × identity × locale)
  // combination, before any side effects. Throws typed RuntimePolicyError
  // when the form/org/instance triple is incoherent; the catch in
  // applyReadyState routes the error to the form-load boundary.
  //
  // Wrap the extractor call so an adopter-thrown error becomes a typed
  // InvalidRuntimePolicyError instead of a generic stack trace — code-review
  // LOW-2.
  let formPolicy;
  try {
    formPolicy = composition.formRuntimePolicyExtractor.extract(definition);
  } catch (cause) {
    throw new InvalidRuntimePolicyError(
      'form',
      `FormRuntimePolicyExtractor.extract threw: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const runtimeProfile = resolveRuntimeFeatures({
    mode: composition.mode,
    instance: composition.instanceCapabilities,
    org: composition.orgRuntimePolicy,
    form: formPolicy,
  });
  // FW-0040: iframe-context gate. No-op when the form is loaded as the
  // top-level window OR when `embed` is disabled. Throws
  // EmbedOriginNotAllowedError when the form is mounted in an iframe whose
  // host origin is not in the org's allow-list; the catch in
  // applyReadyState routes the error to the form-load boundary.
  verifyEmbedOriginAllowed({
    runtimeProfile,
    orgRuntimePolicy: composition.orgRuntimePolicy,
    embedTransport: composition.embedTransport,
  });
  // FW-0027 M-1: offline + payment is hard-rejected at form load (was at
  // submit). The prior placement let the user fill the entire fee-bearing
  // form offline and learn at Submit time that it could not go through.
  // With this hoist, the user sees the unavailable banner BEFORE filling.
  // The check only fires when both `payment` AND `offlineSubmit` are
  // enabled — the only combo that lets the form load without an active
  // connection. FW-0101 lifts the restriction once a held-authorization
  // replay substrate exists.
  if (
    runtimeProfile.enabled.has('payment') &&
    runtimeProfile.enabled.has('offlineSubmit') &&
    !readNavigatorOnLine()
  ) {
    throw new PaymentRequiresOnlineError();
  }
  const draftKey: DraftKey = {
    formUrl: definition.url,
    formVersion: definition.version,
    subjectRef: claim?.subjectRef,
  };
  const draft = await composition.draftStore.load(draftKey);
  const activeLocale = options.locale ?? defaultLocaleForDefinition(definition);

  const engine = createFormEngine(definition, {
    runtimeContext: { locale: activeLocale },
  });
  const localeDocuments = await composition.definitionSource.getLocaleDocuments?.(
    composition.initialDefinitionUrl,
    definition.version,
  );
  for (const localeDocument of localeDocuments ?? []) {
    engine.loadLocale(localeDocument);
  }
  engine.setLocale(activeLocale);
  hydrateEngineFromResponse(engine, draft);
  const resolvedIssuer = await engine.getResolvedIssuer();

  return {
    status: 'ready',
    definition,
    engine,
    draftKey,
    claim,
    resolvedIssuer,
    activeLocale,
    draftLoaded: draft !== undefined,
    runtimeProfile,
  };
}

async function loadRespondentPlace(
  composition: Composition,
  subjectRef: string | undefined,
  profile: ResolvedRuntimeProfile,
): Promise<RespondentPlaceState> {
  const snapshot = await composition.respondentPlaceSource.readPlace({ subjectRef });
  const submissionStatuses = await readSubmissionStatuses(composition, snapshot, profile);
  return {
    status: 'ready',
    snapshot,
    submissionStatuses,
    statusDisabledCause: profile.disabled.get('status')?.cause,
  };
}

async function readSubmissionStatuses(
  composition: Composition,
  snapshot: RespondentPlaceSnapshot,
  profile: ResolvedRuntimeProfile,
): Promise<Record<string, ApplicantStatusResource>> {
  // ADR-0011 §Failure Semantics: status disabled -> skip per-submission fetches.
  // SubmissionItem already handles `status: undefined` via the "Status pending"
  // affordance the respondent already has context for; no new copy needed.
  if (!profile.enabled.has('status')) {
    return {};
  }
  const entries = await Promise.all(
    (snapshot.submissions ?? []).map(async (submission) => {
      if (!submission.applicantStatus) {
        return undefined;
      }
      const status = await composition.statusReader.readStatus({
        subjectRef: snapshot.subject.subjectRef,
        submissionId: submission.id,
        resourceRef: submission.applicantStatus.resourceRef,
        trackingUri: submission.applicantStatus?.endpoint,
      });
      return status ? ([submission.id, status] as const) : undefined;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, ApplicantStatusResource] => (
    entry !== undefined
  )));
}

function RespondentSurface({
  activeLocale,
  brandName,
  claim,
  composition,
  definition,
  draftKey,
  draftLoaded,
  mode,
  respondentPlaceState,
  resolvedIssuer,
  runtimeProfile,
  submitState,
  terminalClearState,
  notificationDelivery,
  onClearTerminal,
  onLocaleChange,
}: {
  activeLocale: string;
  brandName: string;
  claim: IdentityClaim | null;
  composition: Composition;
  definition: FormDefinition;
  draftKey: DraftKey;
  draftLoaded: boolean;
  mode: 'demo' | 'production';
  respondentPlaceState: RespondentPlaceState;
  resolvedIssuer: ResolvedIssuer;
  runtimeProfile: ResolvedRuntimeProfile;
  submitState: SubmitState;
  terminalClearState: TerminalClearState;
  notificationDelivery?: NotificationDelivery;
  onClearTerminal: () => Promise<void>;
  onLocaleChange: (locale: string) => void;
}) {
  const { engine, layoutPlan } = useFormspecContext();
  const localeOptions = useMemo(() => localeOptionsForDefinition(definition), [definition]);
  const isUnbranded = resolvedIssuer.source === 'unbranded';
  const title = engine.resolveLocaleString('$form.title', definition.title);
  const description = engine.resolveLocaleString('$form.description', definition.description ?? '');

  return (
    <>
      {isUnbranded ? (
        <UnbrandedCover title={title} description={description} />
      ) : (
        <header className="respondent-header respondent-header--branded">
          <IssuerChromeSlot engine={engine} hostOrigin={window.location.origin} />
          <p className="respondent-header__kicker respondent-header__kicker--runtime">
            {brandName}
          </p>
          <h1 id="respondent-title">{title}</h1>
          {description ? <p>{description}</p> : null}
        </header>
      )}

      <div className="respondent-toolbar" aria-label="Form settings">
        <div className="respondent-toolbar__group" role="group" aria-label="Language">
          {localeOptions.map((option) => (
            <button
              aria-pressed={activeLocale === option.code}
              className="locale-button"
              key={option.code}
              type="button"
              onClick={() => onLocaleChange(option.code)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="respondent-toolbar__meta" aria-live="polite">
          {draftLoaded ? 'Draft restored' : mode}
        </div>
      </div>

      <SubmitNotice state={submitState} />
      <RespondentPlacePanel state={respondentPlaceState} />
      <TrustedReviewerPanel
        claim={claim}
        composition={composition}
        definition={definition}
        draftKey={draftKey}
        runtimeProfile={runtimeProfile}
      />

      {submitState.status === 'confirmed' ? (
        <ConfirmationPanel
          confirmation={submitState.confirmation}
          captureReceipt={submitState.captureReceipt}
          notificationDelivery={notificationDelivery}
          terminalClearState={terminalClearState}
          onClearTerminal={onClearTerminal}
        />
      ) : layoutPlan ? (
        <>
          <h2 className="sr-only">Form fields</h2>
          <FormspecNode node={layoutPlan} />
        </>
      ) : (
        <div className="shell__status" role="status">
          Preparing fields
        </div>
      )}
    </>
  );
}

type TrustedReviewerState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'ready'; shares: readonly ReviewerShare[]; latestUrl?: string }
  | { status: 'error'; error: unknown };

function TrustedReviewerPanel({
  claim,
  composition,
  definition,
  draftKey,
  runtimeProfile,
}: {
  claim: IdentityClaim | null;
  composition: Composition;
  definition: FormDefinition;
  draftKey: DraftKey;
  runtimeProfile: ResolvedRuntimeProfile;
}) {
  const { engine } = useFormspecContext();
  const audienceId = useId();
  const [audienceHint, setAudienceHint] = useState('');
  const [state, setState] = useState<TrustedReviewerState>({ status: 'disabled' });
  const policySnapshot = useMemo(
    () => trustedReviewerPolicySnapshot(runtimeProfile),
    [runtimeProfile],
  );
  const threadId = reviewerThreadIdForDraft(draftKey);
  const respondentToken = respondentSessionToken(
    `${claim?.subjectRef ?? draftKey.subjectRef ?? 'anonymous'}:thread=${encodeURIComponent(threadId)}`,
  );

  useEffect(() => {
    if (!policySnapshot) {
      setState({ status: 'disabled' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void composition.reviewerSession.listShares({
      threadId,
      respondentSessionToken: respondentToken,
    }).then((shares) => {
      if (!cancelled) setState({ status: 'ready', shares });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ status: 'error', error });
    });
    return () => {
      cancelled = true;
    };
  }, [composition.reviewerSession, policySnapshot, respondentToken, threadId]);

  if (!policySnapshot || state.status === 'disabled') {
    return null;
  }

  const activeShares = state.status === 'ready'
    ? state.shares.filter((share) => !share.revokedAt)
    : [];

  const reloadShares = async (latestUrl?: string): Promise<void> => {
    const shares = await composition.reviewerSession.listShares({
      threadId,
      respondentSessionToken: respondentToken,
    });
    setState({ status: 'ready', shares, latestUrl });
  };

  const mintShare = async (): Promise<void> => {
    setState((current) => (
      current.status === 'ready' ? { status: 'loading' } : current
    ));
    try {
      const responseSnapshot = engine.getResponse({ profile: 'off' });
      await composition.draftStore.save(draftKey, responseSnapshot);
      const draftSnapshot = await reviewerDraftSnapshotForResponse({
        definition,
        policySnapshot,
        response: responseSnapshot,
      });
      await composition.reviewThreadStore.ensureThread({
        threadId,
        draftRef: reviewerDraftRefForDraft(draftKey),
        draftSnapshot,
        policySnapshot,
      });
      if (
        policySnapshot.maxActiveSharesPerDraft &&
        activeShares.length >= policySnapshot.maxActiveSharesPerDraft
      ) {
        throw new Error('No more active reviewer links can be created for this draft.');
      }
      const minted = await composition.reviewerSession.mintShare({
        threadId,
        requestedScope: reviewerScopeForPosture(policySnapshot.posture),
        audienceHint: audienceHint.trim() || undefined,
        respondentSessionToken: respondentToken,
      });
      await composition.reviewThreadStore.appendEvent({
        threadId,
        sessionToken: respondentToken,
        author: {
          kind: 'respondent',
          subjectRef: claim?.subjectRef ?? draftKey.subjectRef,
        },
        payload: {
          type: 'share-minted',
          shareId: minted.shareId,
          audienceHint: audienceHint.trim() || undefined,
        },
      });
      setAudienceHint('');
      await reloadShares(minted.capabilityUrl);
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  const revokeShareWithReason = async (share: ReviewerShare, reason: string): Promise<void> => {
    await composition.reviewerSession.revoke({
      shareId: share.shareId,
      reason,
      respondentSessionToken: respondentToken,
    });
    await composition.reviewThreadStore.appendEvent({
      threadId,
      sessionToken: respondentToken,
      author: {
        kind: 'respondent',
        subjectRef: claim?.subjectRef ?? draftKey.subjectRef,
      },
      payload: {
        type: 'share-revoked',
        shareId: share.shareId,
        reason,
      },
    });
  };

  const revokeShare = async (share: ReviewerShare): Promise<void> => {
    try {
      await revokeShareWithReason(share, 'respondent revoked');
      await reloadShares();
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  const revokeAllActiveShares = async (): Promise<void> => {
    if (state.status !== 'ready') return;
    const sharesToRevoke = state.shares.filter((share) => !share.revokedAt);
    if (sharesToRevoke.length === 0) return;
    setState({ status: 'loading' });
    try {
      for (const share of sharesToRevoke) {
        await revokeShareWithReason(share, 'respondent panic revoked');
      }
      await reloadShares();
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  return (
    <section className="trusted-reviewer" aria-labelledby="trusted-reviewer-title">
      <div className="trusted-reviewer__header">
        <div>
          <p className="respondent-header__kicker">Trusted reviewer</p>
          <h2 id="trusted-reviewer-title">Share this draft</h2>
        </div>
        <span className="place-pill">{policySnapshot.posture}</span>
      </div>
      <div className="trusted-reviewer__controls">
        <label htmlFor={audienceId}>Reviewer label</label>
        <input
          id={audienceId}
          value={audienceHint}
          onChange={(event) => setAudienceHint(event.currentTarget.value)}
        />
        <button
          type="button"
          disabled={state.status === 'loading'}
          onClick={() => {
            void mintShare();
          }}
        >
          Create reviewer link
        </button>
        {activeShares.length > 0 ? (
          <button
            type="button"
            disabled={state.status === 'loading'}
            onClick={() => {
              void revokeAllActiveShares();
            }}
          >
            Stop sharing with everyone
          </button>
        ) : null}
      </div>
      {state.status === 'loading' ? (
        <div className="submit-notice" role="status">
          Loading reviewer links
        </div>
      ) : state.status === 'error' ? (
        <div className="submit-notice submit-notice--error" role="alert">
          {problemDetail(state.error).message}
        </div>
      ) : (
        <ReviewerShareList shares={state.shares} onRevoke={revokeShare} />
      )}
      {state.status === 'ready' && state.latestUrl ? (
        <input
          className="trusted-reviewer__link"
          value={state.latestUrl}
          readOnly
          aria-label="Reviewer link"
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
    </section>
  );
}

function ReviewerShareList({
  onRevoke,
  shares,
}: {
  onRevoke: (share: ReviewerShare) => Promise<void>;
  shares: readonly ReviewerShare[];
}) {
  if (shares.length === 0) {
    return <p className="place-list__empty">No active reviewer links</p>;
  }
  return (
    <ul className="trusted-reviewer__shares">
      {shares.map((share) => (
        <li key={share.shareId}>
          <span>{share.audienceHint || 'Reviewer'}</span>
          <small>{share.revokedAt ? 'revoked' : share.grantedScope}</small>
          {!share.revokedAt ? (
            <button
              type="button"
              onClick={() => {
                void onRevoke(share);
              }}
            >
              Revoke
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RespondentPlacePanel({ state }: { state: RespondentPlaceState }) {
  if (state.status === 'disabled') {
    // Hidden per ADR-0011 §Failure Semantics — the respondent never had
    // context for the panel, so there's no "unavailable" state to surface.
    return null;
  }
  if (state.status === 'loading') {
    return (
      <section className="respondent-place" aria-labelledby="respondent-place-title">
        <RespondentPlaceHeader trustSummary="Loading" />
        <div className="respondent-place__loading" role="status">
          Loading your forms and files
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    const detail = problemDetail(state.error);
    return (
      <section className="respondent-place" aria-labelledby="respondent-place-title">
        <RespondentPlaceHeader trustSummary="Unavailable" />
        <div className="submit-notice submit-notice--error" role="alert">
          {detail.message}
        </div>
      </section>
    );
  }

  const { snapshot, submissionStatuses, statusDisabledCause } = state;
  const obligations = snapshot.obligations ?? [];
  const documents = snapshot.documents ?? [];
  const submissions = snapshot.submissions ?? [];
  const dueCount = obligations.filter((obligation) => (
    obligation.state === 'due' || obligation.state === 'overdue'
  )).length;

  return (
    <section className="respondent-place" aria-labelledby="respondent-place-title">
      <RespondentPlaceHeader trustSummary={trustSummary(snapshot)} />
      <div className="respondent-place__stats" aria-label="Respondent place summary">
        <StatBlock label="Due" value={dueCount} />
        <StatBlock label="Files" value={documents.length} />
        <StatBlock label="Submitted" value={submissions.length} />
      </div>
      <div className="respondent-place__columns">
        <PlaceList title="Obligations" emptyLabel="No open obligations">
          {obligations.map((obligation) => (
            <ObligationItem key={obligation.id} obligation={obligation} />
          ))}
        </PlaceList>
        <PlaceList title="Files" emptyLabel="No saved files">
          {documents.map((document) => (
            <DocumentItem key={document.id} document={document} />
          ))}
        </PlaceList>
        <PlaceList title="Submissions" emptyLabel="No submitted forms">
          {submissions.map((submission) => (
            <SubmissionItem
              key={submission.id}
              status={submissionStatuses[submission.id]}
              statusDisabledCause={statusDisabledCause}
              submission={submission}
            />
          ))}
        </PlaceList>
      </div>
    </section>
  );
}

function RespondentPlaceHeader({ trustSummary }: { trustSummary: string }) {
  return (
    <div className="respondent-place__header">
      <div>
        <p className="respondent-header__kicker">Respondent place</p>
        <h2 id="respondent-place-title">Your forms and files</h2>
      </div>
      <p className="respondent-place__trust">{trustSummary}</p>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="respondent-place__stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PlaceList({
  children,
  emptyLabel,
  title,
}: {
  children: ReactNode;
  emptyLabel: string;
  title: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="place-list" aria-labelledby={`place-list-${slugToken(title)}`}>
      <h3 id={`place-list-${slugToken(title)}`}>{title}</h3>
      {hasChildren ? (
        <ul className="place-list__items">{children}</ul>
      ) : (
        <p className="place-list__empty">{emptyLabel}</p>
      )}
    </section>
  );
}

function SubmissionItem({
  status,
  statusDisabledCause,
  submission,
}: {
  status: ApplicantStatusResource | undefined;
  statusDisabledCause: DisabledCause | undefined;
  submission: RespondentSubmissionRecord;
}) {
  const feedback = statusFeedback(status, submission, statusDisabledCause);
  return (
    <li className="place-list__item">
      <div className="place-list__row">
        <strong>{submission.issuer.name}</strong>
        <span className="place-pill">{feedback.label}</span>
      </div>
      <p>{feedback.detail}</p>
      <small>
        Submitted {formatDate(submission.submittedAt)}
        {submission.documentRefs?.length ? ` / ${submission.documentRefs.length} file(s)` : ''}
      </small>
    </li>
  );
}

function UnbrandedCover({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="respondent-header respondent-header--unbranded">
      <p className="respondent-header__kicker">Formspec Web</p>
      <h1 id="respondent-title">{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

function AuthRequiredSurface({
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
  const detail = error ? problemDetail(error) : undefined;
  // FW-0028: heading switches to picker copy when the deployment offers a
  // real choice. Single-option deployments keep the focused "Sign in to
  // continue" call-to-action.
  const heading = options.length > 1 ? 'Choose how to sign in' : 'Sign in to continue';
  return (
    <section className="auth-required" aria-labelledby="auth-required-title">
      <p className="respondent-header__kicker">Sign in required</p>
      <h1 id="auth-required-title">{heading}</h1>
      <p>This form requires a verified sign-in before it can be loaded.</p>
      <div className="auth-required__actions">
        {options.map((option) => (
          <button
            disabled={authenticating}
            key={idpOptionKey(option)}
            type="button"
            onClick={() => onSignIn(option)}
          >
            {authenticating ? 'Opening sign-in' : idpOptionButtonLabel(option)}
          </button>
        ))}
      </div>
      {detail ? (
        <div className="submit-notice submit-notice--error" role="alert">
          {detail.message}
        </div>
      ) : null}
    </section>
  );
}

function idpOptionKey(option: IdpOption): string {
  if (option.kind === 'oidc') {
    return `${option.kind}:${option.issuer}`;
  }
  if (option.kind === 'magic-link') {
    return `${option.kind}:${option.channel}`;
  }
  return option.kind;
}

function idpOptionButtonLabel(option: IdpOption): string {
  // FW-0028: anonymous gets its own copy — the picker's "no-account" path is
  // a sign-in alternative, not a "sign in with anonymous" action. Vocabulary
  // firewall: user-visible chrome never says "anonymous".
  if (option.kind === 'anonymous') {
    return 'Continue without an account';
  }
  return `Sign in with ${idpOptionLabel(option)}`;
}

function idpOptionLabel(option: IdpOption): string {
  if (option.kind === 'oidc') {
    return option.displayName;
  }
  if (option.kind === 'magic-link') {
    return option.channel === 'sms' ? 'SMS link' : 'email link';
  }
  // Unreachable for 'anonymous' — `idpOptionButtonLabel` handles that branch.
  return 'an account';
}

function SubmitNotice({ state }: { state: SubmitState }) {
  if (state.status === 'idle') {
    return null;
  }
  if (state.status === 'submitting') {
    return (
      <div className="submit-notice" role="status">
        Sending form
      </div>
    );
  }
  if (state.status === 'invalid') {
    return (
      <div className="submit-notice submit-notice--error" role="alert">
        {state.message}
      </div>
    );
  }
  if (state.status === 'error') {
    return <FriendlyError error={state.error} title="We could not submit this form." />;
  }
  if (state.status === 'queued') {
    return <QueuedForLaterPanel />;
  }
  if (state.status === 'authorizing-payment') {
    return (
      <div className="submit-notice" role="status" aria-live="polite">
        <p>{PAYMENT_AUTHORIZING_TITLE}</p>
        <p className="submit-notice__detail">
          {formatMoney(state.amount)} pending. {PAYMENT_AUTHORIZING_BODY}
        </p>
      </div>
    );
  }
  if (state.status === 'capturing-payment') {
    return (
      <div className="submit-notice" role="status" aria-live="polite">
        <p>{PAYMENT_CAPTURING_TITLE}</p>
      </div>
    );
  }
  if (state.status === 'voiding-payment') {
    return (
      <div className="submit-notice" role="status" aria-live="polite">
        <p>{PAYMENT_VOIDING_TITLE}</p>
        <p className="submit-notice__detail">{PAYMENT_VOIDING_BODY}</p>
      </div>
    );
  }
  if (state.status === 'payment-voided-after-submit-failure') {
    return (
      <section className="submit-notice submit-notice--error" role="alert">
        <h2>{PAYMENT_VOIDED_AFTER_SUBMIT_FAILURE_TITLE}</h2>
        <p>{PAYMENT_VOIDED_AFTER_SUBMIT_FAILURE_BODY}</p>
        <p className="submit-notice__detail">{PAYMENT_DEFERRED_CAPABILITY_COPY}</p>
      </section>
    );
  }
  if (state.status === 'capture-failed') {
    return (
      <section className="submit-notice submit-notice--error" role="alert">
        <h2>{PAYMENT_CAPTURE_FAILED_TITLE}</h2>
        <p>
          {PAYMENT_CAPTURE_FAILED_BODY_PREFIX}{' '}
          <strong>{state.confirmation.referenceNumber}</strong>.
        </p>
        <p className="submit-notice__detail">{PAYMENT_DEFERRED_CAPABILITY_COPY}</p>
      </section>
    );
  }
  return null;
}

/** FW-0044 fixture-pinned copy for the "saved for later" panel. */
export const QUEUED_FOR_LATER_TITLE = 'Saved for later';
export const QUEUED_FOR_LATER_BODY = "We'll send it when you reconnect.";

/** FW-0027 fixture-pinned copy. Vocabulary-firewall-safe: no "authorize",
 *  "capture", "void", "rail" — those are spec-internal terms. The user-facing
 *  vocabulary is "payment", "charged", "fee". */
export const PAYMENT_AUTHORIZING_TITLE = 'Authorizing payment…';
export const PAYMENT_AUTHORIZING_BODY = "You haven't been charged yet.";
export const PAYMENT_CAPTURING_TITLE = 'Capturing payment…';
export const PAYMENT_VOIDING_TITLE = 'Releasing the payment…';
export const PAYMENT_VOIDING_BODY = 'Your form did not go through; we are releasing the hold on your funds.';
export const PAYMENT_VOIDED_AFTER_SUBMIT_FAILURE_TITLE = 'Your form did not submit, and the payment was not charged.';
export const PAYMENT_VOIDED_AFTER_SUBMIT_FAILURE_BODY = 'No money has moved. Please try submitting again.';
export const PAYMENT_CAPTURE_FAILED_TITLE = 'Your form was submitted, but we had a problem with the payment.';
export const PAYMENT_CAPTURE_FAILED_BODY_PREFIX = 'Please contact the sender about reference';
export const PAYMENT_RECEIVED_TITLE = 'Payment received';
export const PAYMENT_DEFERRED_CAPABILITY_COPY =
  'If you see a pending charge on your account, it will be released automatically within a few days.';
// Honest in both modes: the demo stub queue is in-memory and the production
// reference adapter is the unavailable sentinel, so "saved for later" does
// not yet survive browser restarts in either composition. FW-0082 (IndexedDB
// adapter + at-rest encryption) is the row that flips this.
export const OFFLINE_DEFERRED_CAPABILITY_COPY =
  'Offline submit support is experimental. Saved-for-later does not yet survive browser restarts or move across devices on any deployment.';

function QueuedForLaterPanel() {
  return (
    <section className="submit-notice submit-notice--queued" role="status" aria-live="polite">
      <h2>{QUEUED_FOR_LATER_TITLE}</h2>
      <p>{QUEUED_FOR_LATER_BODY}</p>
      <p className="submit-notice__detail">{OFFLINE_DEFERRED_CAPABILITY_COPY}</p>
    </section>
  );
}

function readNavigatorOnLine(): boolean {
  // FW-0044: `navigator.onLine` is the slice-1 detection. Documented
  // imperfection: modern browsers cache stale online status, so the
  // synchronous-submit path's inline fetch failure is still the safety
  // net. FW-0081 service worker addresses the discrepancy more cleanly.
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function formatMoney(amount: Money): string {
  try {
    const major = amount.amountMinorUnits / 100;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: amount.currency,
    }).format(major);
  } catch {
    // Fallback for unknown currency codes Intl rejects.
    return `${(amount.amountMinorUnits / 100).toFixed(2)} ${amount.currency}`;
  }
}

export function ConfirmationPanel({
  confirmation,
  captureReceipt,
  notificationDelivery,
  terminalClearState = { status: 'idle' },
  onClearTerminal,
}: {
  confirmation: SubmitConfirmation;
  captureReceipt?: CaptureReceipt;
  notificationDelivery?: NotificationDelivery;
  terminalClearState?: TerminalClearState;
  onClearTerminal?: () => Promise<void> | void;
}) {
  const smsInputId = useId();
  const [smsTo, setSmsTo] = useState('');
  const [smsState, setSmsState] = useState<
    { status: 'idle' } | { status: 'sending' } | { status: 'sent' } | { status: 'error'; error: string }
  >({ status: 'idle' });
  const trackingHref = confirmation.caseUrn
    ? buildConfirmationTrackingUri(confirmation.caseUrn)
    : confirmation.trackingUri;
  const trackingLabel = confirmation.caseUrn ? 'Track this application' : 'Track this submission';
  const verifierCode = publicTerminalVerifierCode(confirmation);

  const handleSmsSend = async (): Promise<void> => {
    if (!notificationDelivery) return;
    setSmsState({ status: 'sending' });
    try {
      await sendPublicTerminalReceiptSms({
        notificationDelivery,
        confirmation,
        phone: smsTo,
      });
      setSmsTo('');
      setSmsState({ status: 'sent' });
    } catch (error) {
      setSmsState({
        status: 'error',
        error: error instanceof Error ? error.message : PUBLIC_TERMINAL_SMS_INVALID_COPY,
      });
    }
  };

  return (
    <section className="confirmation-panel" aria-labelledby="confirmation-title" tabIndex={-1}>
      <h2 id="confirmation-title">Submission received</h2>
      <p>Reference number</p>
      <strong>{confirmation.referenceNumber}</strong>
      <p>
        Verifier code <strong>{verifierCode}</strong>
      </p>
      {trackingHref ? <a href={trackingHref}>{trackingLabel}</a> : null}
      {captureReceipt ? <PaymentReceivedSubCard captureReceipt={captureReceipt} /> : null}
      <div className="public-terminal-actions" aria-label="Public terminal actions">
        <h3>Keep your proof</h3>
        <p>
          Print this confirmation, text it to a phone you control, then clear this computer
          before leaving.
        </p>
        <div className="public-terminal-actions__row">
          <button type="button" onClick={printConfirmation}>
            Print confirmation
          </button>
          {onClearTerminal ? (
            <button
              type="button"
              disabled={terminalClearState.status === 'clearing' || terminalClearState.status === 'cleared'}
              onClick={() => {
                void onClearTerminal();
              }}
            >
              {terminalClearState.status === 'clearing' ? 'Clearing...' : 'Clear this computer'}
            </button>
          ) : null}
        </div>
        {notificationDelivery ? (
          <div className="public-terminal-actions__sms">
            <label htmlFor={smsInputId}>Text receipt to SMS</label>
            <div className="public-terminal-actions__row">
              <input
                id={smsInputId}
                value={smsTo}
                inputMode="tel"
                autoComplete="off"
                placeholder="+1 555 010 1234"
                onChange={(event) => setSmsTo(event.currentTarget.value)}
              />
              <button
                type="button"
                disabled={smsState.status === 'sending' || smsTo.trim().length === 0}
                onClick={() => {
                  void handleSmsSend();
                }}
              >
                {smsState.status === 'sending' ? 'Sending...' : 'Text receipt'}
              </button>
            </div>
            {smsState.status === 'sent' ? (
              <p className="public-terminal-actions__status" role="status">
                {PUBLIC_TERMINAL_SMS_SENT_COPY}
              </p>
            ) : null}
            {smsState.status === 'error' ? (
              <p className="public-terminal-actions__error" role="alert">
                {smsState.error}
              </p>
            ) : null}
          </div>
        ) : null}
        {terminalClearState.status === 'error' ? (
          <p className="public-terminal-actions__error" role="alert">
            {problemDetail(terminalClearState.error).message}
          </p>
        ) : null}
        <p className="public-terminal-actions__print-url">
          {publicTerminalTrackingUrl(confirmation) ?? ''}
        </p>
      </div>
    </section>
  );
}

function TerminalClearedPanel() {
  return (
    <div className="shell__status" role="status">
      <h1>{PUBLIC_TERMINAL_CLEARED_TITLE}</h1>
      <p>{PUBLIC_TERMINAL_CLEARED_BODY}</p>
    </div>
  );
}

function printConfirmation(): void {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

export function PaymentReceivedSubCard({ captureReceipt }: { captureReceipt: CaptureReceipt }) {
  return (
    <div className="confirmation-panel__payment" aria-labelledby="payment-received-title">
      <h3 id="payment-received-title">{PAYMENT_RECEIVED_TITLE}</h3>
      <p>
        {formatMoney(captureReceipt.amount)}{' '}
        <span className="confirmation-panel__rail-label">{captureReceipt.railLabel}</span>
      </p>
      <p className="confirmation-panel__settled-id">
        Payment ID: <code>{captureReceipt.settledTransactionId}</code>
      </p>
    </div>
  );
}

function RuntimePolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <div className="shell__status shell__status--error" role="alert">
      <h1>This form cannot be loaded.</h1>
      <p>{runtimePolicyErrorCopy(error)}</p>
      <p className="support-code">Support reference: {error.code}</p>
    </div>
  );
}

/**
 * Per-feature plain-language copy for runtime-policy errors at form load.
 * FW-0033 adds the fileUpload row; other keys fall back to the generic
 * sentence. Fixture-pinned in tests/app/respondent-runtime-attachment.test.tsx.
 *
 * L-5: narrow on the typed subclasses that carry a featureKey before reading
 * it; InvalidRuntimePolicyError has no featureKey and falls through to the
 * generic copy. The previous `(error as { featureKey?: string })` cast bled
 * a structural untyped read into the typed-error surface.
 *
 * Branch ordering: instanceof early-returns for the class-discriminated
 * errors (EmbedOriginNotAllowedError, PaymentRequiresOnlineError — the
 * error class IS the discriminator; no featureKey lookup needed) come
 * before the featureKey cascade for the three featureKey-bearing
 * subclasses. Typed-error-map refactor (Record<RuntimeFeatureKey, copy
 * fn>) is FW-0108.
 */
function runtimePolicyErrorCopy(error: RuntimePolicyError): string {
  if (error instanceof EmbedOriginNotAllowedError) {
    return 'This form is not set up to be shown on this site.';
  }
  if (error instanceof PaymentRequiresOnlineError) {
    return PAYMENT_REQUIRES_ONLINE_COPY;
  }
  if (
    error instanceof UnsupportedRequiredFeatureError ||
    error instanceof FeaturePolicyConflictError ||
    error instanceof OrgPolicyUnsatisfiedError
  ) {
    if (error.featureKey === 'fileUpload') {
      return 'This form needs file uploads, but this site is not set up to receive files.';
    }
    if (error.featureKey === 'payment') {
      return 'This form requires payment, but this site is not set up to accept payments.';
    }
  }
  return 'This form requires a capability this site does not currently support. Try again later, or contact the sender for help.';
}

/**
 * FW-0027 M-1 fixture-pinned copy for the offline-at-load + payment-required
 * banner. Slice-1 hard-reject; FW-0101 lifts the restriction once a
 * substrate exists for held-authorization replay.
 */
export const PAYMENT_REQUIRES_ONLINE_COPY =
  'This form requires payment and cannot be saved for later — you must be online to fill it. (Offline payment support is on the roadmap.)';

function FriendlyError({
  error,
  headingLevel = 'h2',
  title,
}: {
  error: unknown;
  headingLevel?: 'h1' | 'h2';
  title: string;
}) {
  const detail = problemDetail(error);
  const Heading = headingLevel;
  return (
    <div className="shell__status shell__status--error" role="alert">
      <Heading>{title}</Heading>
      <p>{detail.message}</p>
      {detail.code ? <p className="support-code">Support reference: {detail.code}</p> : null}
    </div>
  );
}

function validationMessage(report: ValidationReport): string {
  const errorCount = report.counts?.error ?? 0;
  if (errorCount === 1) {
    return 'Check the required field marked with an error, then submit again.';
  }
  return `Check the ${errorCount} fields marked with errors, then submit again.`;
}

function problemDetail(error: unknown): { message: string; code?: string } {
  const problem = problemFromError(error);
  if (problem) {
    return problemMessage(problem);
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: 'Try again. If the problem continues, contact support.' };
}

function problemFromError(error: unknown): ProblemJson | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  return isProblemJson(error.problem) ? error.problem : undefined;
}

function problemMessage(problem: ProblemJson): { message: string; code: string } {
  return {
    message: problem.detail ? `${problem.title}: ${problem.detail}` : problem.title,
    code: problem.error_code,
  };
}

function trustSummary(snapshot: RespondentPlaceSnapshot): string {
  return [
    labelFromToken(snapshot.trustModel.storagePosture),
    labelFromToken(snapshot.trustModel.issuerIsolation),
    'server aggregation forbidden',
  ].join(' / ');
}

function statusFeedback(
  status: ApplicantStatusResource | undefined,
  submission: RespondentSubmissionRecord,
  disabledCause: DisabledCause | undefined,
): { label: string; detail: string } {
  if (!status) {
    // Disabled-by-policy: respondent never has reason to expect a status
    // update from this issuer. Distinguish from "not yet published" so we
    // don't falsely imply the status will arrive later (arch-review M-3).
    if (disabledCause === 'org-forbidden' || disabledCause === 'form-forbidden') {
      return {
        label: 'Status not shared',
        detail: 'This issuer does not share application status here.',
      };
    }
    return {
      label: submission.applicantStatus?.headline ?? 'Status pending',
      detail: submission.applicantStatus?.summary ?? 'Status has not been published yet.',
    };
  }
  if ('event' in status) {
    return {
      label: labelFromToken(status.event),
      detail: status.summary ?? submission.applicantStatus?.summary ?? 'Timeline update received.',
    };
  }
  if ('lifecycleState' in status) {
    return {
      label: labelFromToken(status.lifecycleState),
      detail: status.title ?? submission.applicantStatus?.summary ?? 'Case status received.',
    };
  }
  if ('statusTimeline' in status) {
    const latest = status.statusTimeline.at(-1);
    return latest
      ? {
          label: labelFromToken(latest.event),
          detail: latest.summary ?? status.summary.title ?? 'Case timeline updated.',
        }
      : {
          label: labelFromToken(status.summary.lifecycleState),
          detail: status.summary.title ?? 'Case status received.',
        };
  }
  if ('status' in status) {
    return {
      label: labelFromToken(String(status.status)),
      detail: 'body' in status ? status.body : status.title,
    };
  }
  if ('items' in status) {
    return {
      label: status.hasMore ? 'More updates' : 'Updates',
      detail: `${status.items.length} applicant update(s) available.`,
    };
  }
  if ('agentsInvolved' in status) {
    return {
      label: 'AI disclosure',
      detail: `${status.agentsInvolved.length} agent disclosure record(s) available.`,
    };
  }
  return {
    label: status.roleInDecision,
    detail: status.displayName,
  };
}

// Format helpers moved to ./format.ts so StatusRuntime + RespondentRuntime
// share one definition (FW-0039 slice 1). Re-exported below via direct
// import sites; nothing else in this file references them by closure.

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Respondent flow crashed', error, errorInfo);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <FriendlyError error={this.state.error} title="This form stopped responding." />;
    }
    return this.props.children;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
