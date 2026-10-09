import { assertSynchronousGuard } from '../shared/synchronous-guard.ts';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createDemoSubmitResponseActions,
  createFormEngine,
  type IFormEngine,
  type InstanceSourceResolver,
  type ResolvedIssuer,
} from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import {
  FormspecNode,
  FormspecFormContent,
  FormspecProvider,
  IssuerChromeSlot,
  DefaultField,
  useFormspecContext,
  useChromeText,
  chromeText,
  projectionMetadataAttrs,
  type FieldComponentProps,
  type ResponseAction,
  type ResponseActionInvocationResult,
  type ResponseActionsDocument,
  type SubmitResult,
} from '@formspec-org/react';
import type { ChromeStringKey, ComponentGraphProjectionContext, LayoutHostEvidence } from '@formspec-org/layout';
import type { SurfaceDefinitionFormRenderInput } from '@formspec-org/surface-react';
import type {
  ComponentDocument,
  FormDefinition,
  FormResponse,
  LocaleDocument,
  RegistryEntry,
  ThemeDocument,
  ValidationReport,
} from '@formspec-org/types';
import type { FormspecWebConfig, IdentityPolicyConfig } from '../config/types.ts';
import {
  defaultLocaleForDefinition,
  localeOptionsForDefinition,
} from '../demo/locales.ts';
import type { Composition } from '../composition/types.ts';
import { DraftVersionConflictError, type DraftReadState, type DraftKey } from '../ports/draft-store.ts';
import type { ApplicationCaseReceipt, ApplicationCaseLookupUnavailable } from '../ports/application-lifecycle.ts';
import type { SignedResponseSigning } from '../ports/response-signing.ts';
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
import type { SubmitReceiptReference, SubmitConfirmation } from '../ports/submit-transport.ts';
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
  HiddenDefinitionRuntimeStateError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  PaymentRequiresOnlineError,
  UnsupportedRequiredFeatureError,
  anyEnabledFeatureIsLocaleConditional,
  getSafeAddressRuntimeConfig,
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
  assertMultiPartySignerCanSubmit,
  assertIdentityPolicySatisfied,
  buildMultiPartyAggregateResponse,
  buildConfirmationTrackingUri,
  buildIntakeHandoff,
  formAssuranceFloorForDefinition,
  hydrateEngineFromResponse,
  identityClaimMeetsAssurance,
  identitySubjectChanged,
  idpOptionMeetsAssurance,
  isIdentityInteractionStarted,
  multiPartyComplete,
  multiPartyDraftKey,
  multiPartyProgressDraftKey,
  multiPartyStateDraftResponse,
  multiPartyStateFromDraft,
  recordMultiPartySignerState,
  requiredMultiPartySlots,
  selectBootIdentityOption,
  signInOptionsForIdentityPolicy,
  subjectRefInvalidatedByIdentityChange,
  submitOrQueue,
  submitWithPayment,
  verifyEmbedOriginAllowed,
  type MultiPartyPersistedState,
  type MultiPartySignerProgress,
} from './respondent-flow.ts';
import {
  PUBLIC_TERMINAL_SMS_INVALID_COPY,
  PUBLIC_TERMINAL_SMS_SENT_COPY,
  canSendPublicTerminalReceiptSms,
  clearPublicTerminalDraftState,
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
import { validateSafeAddressResponseData } from './safe-address.ts';
import { useResolvedRuntimeProfile } from './hooks/useResolvedRuntimeProfile.ts';

export interface RespondentRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
}

/**
 * Exact form inputs already selected by an admitted Surface route.
 *
 * The controller treats these as authority. It does not ask DefinitionSource
 * for another copy or substitute demo Response Actions, Theme, or Registry
 * entries.
 */
export interface ResolvedRespondentFormInput {
  readonly definition: FormDefinition;
  readonly themeDocument: ThemeDocument;
  readonly registryEntries: readonly RegistryEntry[];
  readonly responseActionsDocument: ResponseActionsDocument | undefined;
  readonly localeDocuments?: readonly LocaleDocument[];
  readonly activeLocale?: string;
  readonly componentDocument?: ComponentDocument;
  /** Establish ownership after restore and before controls mount; release resources if setup throws. */
  /** Trusted native source policy; supplied before any engine source task starts. */
  readonly instanceSourceResolver?: InstanceSourceResolver;
  readonly configureRuntime?: (input: RespondentOwnedRuntimeInput) => Promise<RespondentOwnedRuntime>;
  readonly configureSubmittedRuntime?: (input: RespondentSubmittedRuntimeInput) => Promise<Pick<RespondentOwnedRuntime, 'invalidate' | 'dispose'>>;
  readonly responseActionInvoker?: SurfaceDefinitionFormRenderInput['responseActionInvoker'];
  readonly semanticControlScope?: SurfaceDefinitionFormRenderInput['semanticControlScope'];
  /**
   * Surface's completed-action navigation boundary. The invocation result is
   * part of the report, not decoration: `SurfaceRoute` reads
   * `result.transitionBindings` to carry the action's own bindings into the
   * transition it supplies, so the host hands back the whole terminal.
   */
  readonly onActionCompleted?: (
    action: ResponseAction,
    result: ResponseActionInvocationResult<SubmitResult>,
  ) => void;
}

export interface RespondentEngineExchange {
  readonly expected: IFormEngine;
  readonly engine: IFormEngine;
  readonly adopt: () => void;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}

export interface RespondentOwnedRuntimeInput {
  readonly engine: IFormEngine;
  /** Runtime owns both engines until React commits or rolls back this exchange. */
  readonly exchangeEngine?: (replacement: RespondentEngineExchange) => Promise<void>;
  readonly definition: FormDefinition;
  readonly draftKey: DraftKey;
  readonly claim: IdentityClaim | null;
  readonly restoredResponse?: FormResponse;
  readonly restoredSigning?: SignedResponseSigning;
  readonly restoredApplication?: ApplicationCaseReceipt;
  readonly restoredApplicationLookup?: ApplicationCaseLookupUnavailable;
  readonly activeLocale: string;
}

export interface RespondentSubmittedRuntimeInput {
  readonly definition: FormDefinition;
  readonly draftKey: DraftKey;
  readonly claim: IdentityClaim | null;
  readonly state: Extract<DraftReadState, { kind: 'submitted' }>;
}

export interface RespondentOwnedRuntime {
  readonly responseActionInvoker: NonNullable<SurfaceDefinitionFormRenderInput['responseActionInvoker']>;
  readonly semanticControlScope: SurfaceDefinitionFormRenderInput['semanticControlScope'];
  /** Refuse new actions immediately, before Clear drains any outstanding writes. */
  readonly invalidate: () => void;
  /** Observed after the initial renderer commit; may qualify an existing saved candidate. */
  readonly afterMount?: () => Promise<void>;
  /** Optional opaque marker used only to reject a queued stale terminal. */
  readonly getCompletionGeneration?: () => string | number;
  /** Retire this mounted form; its host may retain a frozen preparation across routes. */
  readonly dispose: () => void;
}

export interface RespondentDefinitionControllerProps extends RespondentRuntimeProps {
  readonly form: ResolvedRespondentFormInput;
  readonly onSubmitConfirmed?: (confirmation: SubmitConfirmation) => void;
}

interface RespondentControllerProps extends RespondentRuntimeProps {
  readonly form?: ResolvedRespondentFormInput;
  readonly renderMode: 'standalone' | 'surface-slot';
  readonly onSubmitConfirmed?: (confirmation: SubmitConfirmation) => void;
}

const engineReady = initFormspecEngine();
const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';
const COMPONENT_GRAPH_CONTEXT_SCHEMA_ID = 'https://formspec.org/schemas/componentGraphProjectionContext/0.1';

type RespondentState =
  | { status: 'loading' }
  | {
      status: 'auth-required';
      options: IdpOption[];
      authenticating: boolean;
      reason: 'initial-sign-in' | 'assurance-step-up';
      assuranceFloor?: AssuranceLevel;
      error?: unknown;
    }
  | {
      status: 'ready';
      definition: FormDefinition;
      localeDocuments: readonly LocaleDocument[];
      themeDocument: ThemeDocument | null;
      responseActionsDocument: ResponseActionsDocument | null;
      componentDocument: ComponentDocument | null;
      componentGraph: ComponentGraphProjectionContext | null;
      hostEvidence: LayoutHostEvidence | null;
      engine: IFormEngine;
      draftKey: DraftKey;
      claim: IdentityClaim | null;
      resolvedIssuer: ResolvedIssuer;
      activeLocale: string;
      draftLoaded: boolean;
      multiPartyState: MultiPartyPersistedState | null;
      runtimeProfile: ResolvedRuntimeProfile;
      ownedRuntime?: RespondentOwnedRuntime;
    }
  | {
      status: 'draft-conflict';
      error: DraftVersionConflictError;
      engine: IFormEngine;
      definition: FormDefinition;
      localeDocuments: readonly LocaleDocument[];
      activeLocale: string;
    }
  | { status: 'submitted'; terminalRuntime: Pick<RespondentOwnedRuntime, 'invalidate' | 'dispose'> }
  | { status: 'terminal-cleared'; title: string; detail: string }
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
  | {
      status: 'awaiting-next-party';
      nextPartyLabel: string;
      signedCount: number;
      totalCount: number;
    }
  // FW-0027: 'capture-failed' is the rare-but-named failure mode — the
  // submit IS in the system, but the rail's settlement queue could not
  // complete the charge. The respondent must be told to contact the sender
  // with their reference number.
  | { status: 'capture-failed'; confirmation: SubmitConfirmation; error: unknown }
  | { status: 'confirmed'; confirmation: SubmitConfirmation; captureReceipt?: CaptureReceipt };

function submissionLocksLocale(state: SubmitState): boolean {
  return state.status !== 'idle' && state.status !== 'invalid'
    && state.status !== 'error' && state.status !== 'payment-voided-after-submit-failure';
}

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

export function RespondentRuntime(props: RespondentRuntimeProps) {
  return <RespondentController {...props} renderMode="standalone" />;
}

/**
 * Reusable respondent controller for a verified `definition-form` Surface
 * slot. Surface owns the route heading and navigation; this component keeps
 * the existing draft, submit, Response Actions, payment, identity, and status
 * behavior.
 */
export function RespondentDefinitionController({
  composition,
  config,
  form,
  onSubmitConfirmed,
}: RespondentDefinitionControllerProps) {
  return (
    <RespondentController
      composition={composition}
      config={config}
      form={form}
      renderMode="surface-slot"
      onSubmitConfirmed={onSubmitConfirmed}
    />
  );
}

function RespondentController({
  composition,
  config,
  form,
  renderMode,
  onSubmitConfirmed,
}: RespondentControllerProps) {
  const [respondentState, setRespondentState] = useState<RespondentState>({ status: 'loading' });
  const pendingExchange = useRef<{
    request: RespondentEngineExchange; rollback?: unknown;
    commit: () => void; resolve: () => void; reject: (error: unknown) => void;
  } | undefined>(undefined);
  useLayoutEffect(() => {
    const pending = pendingExchange.current;
    if (!pending) return;
    const { request } = pending;
    if (respondentState.status === 'ready' && respondentState.engine === request.engine) {
      try {
        if (pending.rollback) throw pending.rollback;
        request.signal.throwIfAborted(); assertSynchronousGuard(request.assertCurrent);
        pending.commit(); pendingExchange.current = undefined;
        request.expected.dispose(); pending.resolve();
      } catch (error) {
        pending.rollback = error;
        setRespondentState(previous => previous.status === 'ready' && previous.engine === request.engine
          ? { ...previous, engine: request.expected } : previous);
      }
    } else {
      // Replacement never committed, or React has now committed the rollback.
      pendingExchange.current = undefined; request.engine.dispose();
      pending.reject(pending.rollback ?? new Error('Respondent engine exchange retired'));
    }
  }, [respondentState]);

  const mountedOwner = respondentState.status === 'ready' ? respondentState.ownedRuntime : undefined;
  useEffect(() => { if (mountedOwner?.afterMount) void mountedOwner.afterMount().catch(() => {}); }, [mountedOwner]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [respondentPlaceState, setRespondentPlaceState] = useState<RespondentPlaceState>({
    status: 'loading',
  });
  const [terminalClearState, setTerminalClearState] = useState<TerminalClearState>({
    status: 'idle',
  });
  const [multiPartyState, setMultiPartyState] = useState<MultiPartyPersistedState | null>(null);
  const [completedAction, setCompletedAction] = useState<CompletedRespondentAction | null>(null);
  const [localeSaveError, setLocaleSaveError] = useState<unknown>(null);
  const [bootRevision, setBootRevision] = useState(0);
  const focusAfterRestart = useRef(false);
  const readyRegion = useRef<HTMLDivElement>(null);
  const restartLocale = useRef<string | undefined>(undefined);
  const disposeActiveEngine = useRef<(() => void) | null>(null);
  const localeSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const submissionInProgressRef = useRef(false);
  const terminalClearRequestedRef = useRef(false);
  const onSubmitConfirmedRef = useRef(onSubmitConfirmed);
  const onActionCompletedRef = useRef(form?.onActionCompleted);
  onSubmitConfirmedRef.current = onSubmitConfirmed;
  onActionCompletedRef.current = form?.onActionCompleted;
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
    let ownedRuntime: Pick<RespondentOwnedRuntime, 'invalidate' | 'dispose'> | undefined;
    const disposeOwnedRuntime = () => { const active = ownedRuntime; ownedRuntime = undefined; active?.dispose(); };
    let unsubscribe: (() => void) | undefined;
    let activeClaim: IdentityClaim | null = null;
    let pendingAssuranceFloor: AssuranceLevel | undefined;
    let reloadSequence = 0;
    terminalClearRequestedRef.current = false;
    setRespondentState({ status: 'loading' });
    setSubmitState({ status: 'idle' });
    setTerminalClearState({ status: 'idle' });
    setMultiPartyState(null);
    setCompletedAction(null);

    const applyReadyState = async (
      claim: IdentityClaim | null,
      options: { locale?: string } = {},
    ): Promise<void> => {
      // applyReadyStateRef set below so render-time callers (handleLocaleChange)
      // can restart this bootstrap when a locale-conditional feature key needs
      // a new ResolvedRuntimeProfile.
      const sequence = ++reloadSequence;
      ownedRuntime?.invalidate();
      disposeOwnedRuntime();
      engine?.dispose();
      engine = undefined;
      setRespondentState({ status: 'loading' });
      setSubmitState({ status: 'idle' });
      try {
        await engineReady;
        const exchangeEngine = async (request: RespondentEngineExchange): Promise<void> => {
          request.signal.throwIfAborted(); assertSynchronousGuard(request.assertCurrent);
          if (cancelled || sequence !== reloadSequence || engine !== request.expected || pendingExchange.current) {
            throw new Error('Respondent engine exchange retired');
          }
          assertSynchronousGuard(request.adopt);
          await new Promise<void>((resolve, reject) => {
            pendingExchange.current = { request, resolve, reject,
              commit: () => {
                if (cancelled || sequence !== reloadSequence || engine !== request.expected) throw new Error('Respondent engine exchange retired');
                engine = request.engine;
              } };
            setRespondentState(previous => previous.status === 'ready' && previous.engine === request.expected
              ? { ...previous, engine: request.engine } : previous);
          });
        };
        const readyState = await createReadyState(composition, config, claim,
          restartLocale.current === undefined ? options : { ...options, locale: restartLocale.current }, form, exchangeEngine);
        restartLocale.current = undefined;

        if (cancelled || sequence !== reloadSequence) {
          if (readyState.status === 'ready') readyState.ownedRuntime?.dispose();
          if (readyState.status === 'submitted') readyState.terminalRuntime.dispose();
          if ('engine' in readyState) {
            readyState.engine.dispose();
          }
          return;
        }

        activeClaim = claim;
        if (readyState.status === 'ready') {
          disposeOwnedRuntime();
          engine = readyState.engine;
          ownedRuntime = readyState.ownedRuntime;
          pendingAssuranceFloor = undefined;
          setMultiPartyState(readyState.multiPartyState);
        } else {
          disposeOwnedRuntime();
          engine = 'engine' in readyState ? readyState.engine : undefined;
          if (readyState.status === 'submitted') ownedRuntime = readyState.terminalRuntime;
          pendingAssuranceFloor = readyState.status === 'auth-required' ? readyState.assuranceFloor : undefined;
          setMultiPartyState(null);
        }
        setRespondentState(readyState);
      } catch (error) {
        if (!cancelled && sequence === reloadSequence) {
          setRespondentState({ status: 'error', error });
        }
      }
    };
    applyReadyStateRef.current = applyReadyState;
    disposeActiveEngine.current = () => { disposeOwnedRuntime(); engine?.dispose(); engine = undefined; };

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
          reason: 'initial-sign-in',
        });
      }
      // Invariant: subscribe's `activeClaim` closure must reflect boot before
      // the listener fires. Without this, a replay-shaped subscribe (e.g.,
      // future OIDC re-hydrate emitting boot.claim) would compare nextClaim
      // to a stale null and trip the subject-changed branch (code review H-1).
      activeClaim = boot.claim;
      unsubscribe = composition.identityProvider.subscribe((receivedClaim) => {
        const nextClaim = identityClaimAllowedForPolicy(receivedClaim, {
          identityMode: config.identity.mode, runtimeMode: composition.mode,
        }) ? receivedClaim : null;
        if (terminalClearRequestedRef.current) {
          activeClaim = nextClaim;
          return;
        }
        const invalidatedSubjectRef = subjectRefInvalidatedByIdentityChange(activeClaim, nextClaim);
        const subjectChanged = identitySubjectChanged(activeClaim, nextClaim);
        const assuranceStepUpSatisfied = pendingAssuranceFloor !== undefined &&
          identityClaimMeetsAssurance(nextClaim, pendingAssuranceFloor) &&
          !identityClaimMeetsAssurance(activeClaim, pendingAssuranceFloor);
        if (!subjectChanged && !assuranceStepUpSatisfied) {
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
      disposeOwnedRuntime();
      engine?.dispose();
      const exchange = pendingExchange.current;
      pendingExchange.current = undefined;
      if (exchange) { exchange.request.engine.dispose(); exchange.reject(new Error('Respondent engine exchange unmounted')); }
      applyReadyStateRef.current = null;
      disposeActiveEngine.current = null;
    };
  }, [
    bootRevision,
    composition,
    config,
    form?.activeLocale,
    form?.componentDocument,
    form?.configureRuntime,
    form?.configureSubmittedRuntime,
    form?.definition,
    form?.localeDocuments,
    form?.registryEntries,
    form?.responseActionsDocument,
    form?.themeDocument,
  ]);

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
            onSubmitConfirmedRef.current?.(sent.confirmation);
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

  // Legacy host events finish before the asynchronous transport confirmation.
  // Owned invokers return their verified terminal directly; bind it to its
  // emitting runtime and private generation until this post-render handoff.
  useEffect(() => {
    if (renderMode !== 'surface-slot' || completedAction === null) return;
    if (!completedAction.owner && submitState.status !== 'confirmed') return;
    setCompletedAction(null);
    if (respondentState.status !== 'ready' || terminalClearRequestedRef.current) return;
    if (completedAction.owner) {
      if (respondentState.ownedRuntime !== completedAction.owner) return;
      try {
        if (completedAction.owner.getCompletionGeneration
          && completionGeneration(completedAction.owner) !== completedAction.generation) return;
      } catch { return; }
    }
    if (!completedRespondentAction(completedAction.result)) return;
    onActionCompletedRef.current?.(completedAction.action, completedAction.result);
  }, [completedAction, renderMode, respondentState, submitState.status]);

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
              reason: 'initial-sign-in',
              error,
            },
      );
    }
  };

  useEffect(() => {
    if (respondentState.status === 'ready' && focusAfterRestart.current) {
      focusAfterRestart.current = false;
      const region = readyRegion.current;
      (region?.querySelector<HTMLElement>('#respondent-title, .sr-only[tabindex]') ?? region)?.focus();
    }
  }, [respondentState]);

  const handleStartCurrent = async (): Promise<void> => {
    if (terminalClearRequestedRef.current || submissionInProgressRef.current) return;
    if (respondentState.status !== 'ready' && respondentState.status !== 'draft-conflict') return;
    terminalClearRequestedRef.current = true;
    if (respondentState.status === 'ready') respondentState.ownedRuntime?.invalidate();
    setTerminalClearState({ status: 'clearing' });
    try {
      await localeSaveQueue.current;
      const key = respondentState.status === 'draft-conflict'
        ? respondentState.error.currentDraftKey
        : multiPartyState?.progress.activePartyRef
          ? multiPartyDraftKey(respondentState.draftKey, multiPartyState.progress.activePartyRef)
          : respondentState.draftKey;
      await composition.draftStore.delete(key);
      disposeActiveEngine.current?.();
      setLocaleSaveError(null);
      restartLocale.current = respondentState.activeLocale;
      focusAfterRestart.current = true;
      setBootRevision(value => value + 1);
    } catch (error) {
      terminalClearRequestedRef.current = false;
      setTerminalClearState({ status: 'error', error });
    }
  };

  if (respondentState.status === 'draft-conflict') {
    return <FormspecProvider engine={respondentState.engine}>
      <DraftRecoveryPanel state={respondentState} clearState={terminalClearState}
        headingLevel={renderMode === 'surface-slot' ? 'h2' : 'h1'}
        onStart={() => { void handleStartCurrent(); }}
        onLocaleChange={locale => {
          if (terminalClearRequestedRef.current) return;
          respondentState.engine.setLocale(locale);
          setRespondentState({ ...respondentState, activeLocale: locale });
        }} />
    </FormspecProvider>;
  }

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
        headingLevel={renderMode === 'surface-slot' ? 'h2' : 'h1'}
        options={respondentState.options}
        reason={respondentState.reason}
        onSignIn={(option) => {
          void handleSignIn(option);
        }}
      />
    );
  }

  if (respondentState.status === 'error') {
    if (isRuntimePolicyError(respondentState.error)) {
      return (
        <RuntimePolicyErrorPage
          error={respondentState.error}
          headingLevel={renderMode === 'surface-slot' ? 'h2' : 'h1'}
        />
      );
    }
    return (
      <FriendlyError
        error={respondentState.error}
        headingLevel={renderMode === 'surface-slot' ? 'h2' : 'h1'}
        title="We could not load this form."
      />
    );
  }

  if (respondentState.status === 'submitted') return null;

  if (respondentState.status === 'terminal-cleared') {
    return (
      <TerminalClearedPanel
        title={respondentState.title} detail={respondentState.detail}
        headingLevel={renderMode === 'surface-slot' ? 'h2' : 'h1'}
      />
    );
  }

  const responseActionsDocument = form
    ? form.responseActionsDocument
    : respondentState.responseActionsDocument ?? createDemoSubmitResponseActions({
        definitionUrl: respondentState.definition.url,
      });
  const responseActionInvoker = respondentState.ownedRuntime?.responseActionInvoker ?? form?.responseActionInvoker ?? composition.responseActionInvoker?.({
    runtimeDefinitionUrl: form?.definition.url ?? composition.initialDefinitionUrl,
    definition: respondentState.definition,
    draftKey: respondentState.draftKey,
    claim: respondentState.claim,
  }) ?? null;

  const handleLocaleChange = (locale: string): void => {
    if (submissionInProgressRef.current || submissionLocksLocale(submitState)
      || terminalClearRequestedRef.current) return;
    if (anyEnabledFeatureIsLocaleConditional(respondentState.runtimeProfile.enabled)) {
      // A future feature ADR registered a locale-conditional key; the resolved
      // profile may differ under the new locale, so restart the form-load
      // boundary per ADR-0011 §Resolution.
      void applyReadyStateRef.current?.(respondentState.claim, { locale });
      return;
    }
    respondentState.engine.setLocale(locale);
    setRespondentState({ ...respondentState, activeLocale: locale });
    const snapshot = respondentState.engine.getResponse({ profile: 'off' });
    const key = multiPartyDraftKey(
      respondentState.draftKey,
      respondentState.multiPartyState?.progress.activePartyRef,
    );
    // Serialize saves so a slower earlier language change cannot replace a later pin.
    localeSaveQueue.current = localeSaveQueue.current.then(async () => {
      try {
        await composition.draftStore.save(key, snapshot);
        setLocaleSaveError(null);
      } catch (error) {
        setLocaleSaveError(error);
      }
    });
  };

  const handleSubmit = async (result: SubmitResult): Promise<void> => {
    if (respondentState.ownedRuntime) return;
    if (
      terminalClearRequestedRef.current ||
      submitState.status === 'submitting' ||
      submitState.status === 'confirmed' ||
      submitState.status === 'queued' ||
      submitState.status === 'awaiting-next-party' ||
      submitState.status === 'authorizing-payment' ||
      submitState.status === 'capturing-payment' ||
      submitState.status === 'voiding-payment'
    ) {
      return;
    }

    submissionInProgressRef.current = true;
    setSubmitState({ status: 'submitting' });
    try {
      await localeSaveQueue.current;
      await respondentState.engine.getResolvedIssuer();
      const multiPartyPolicy = respondentState.runtimeProfile.multiParty;
      const currentMultiPartyState = multiPartyPolicy ? respondentState.multiPartyState : null;
      if (multiPartyPolicy && currentMultiPartyState) {
        assertMultiPartySignerCanSubmit({
          claim: respondentState.claim,
          policy: multiPartyPolicy,
          progress: currentMultiPartyState.progress,
        });
      }
      const activeDraftKey = multiPartyDraftKey(
        respondentState.draftKey,
        currentMultiPartyState?.progress.activePartyRef,
      );
      await composition.draftStore.save(activeDraftKey, result.response);

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
      const safeAddressConfig = getSafeAddressRuntimeConfig(respondentState.runtimeProfile);
      if (safeAddressConfig) {
        await validateSafeAddressResponseData({
          config: safeAddressConfig,
          directory: composition.safeAddressDirectory,
          data: completedResponse.data,
        });
      }
      await composition.draftStore.save(activeDraftKey, completedResponse);
      let completedMultiPartyState: MultiPartyPersistedState | null = null;
      if (multiPartyPolicy && currentMultiPartyState) {
        completedMultiPartyState = await recordMultiPartySignerState({
          claim: respondentState.claim,
          idempotencyKey,
          policy: multiPartyPolicy,
          response: completedResponse,
          state: currentMultiPartyState,
        });
        await composition.draftStore.save(
          multiPartyProgressDraftKey(respondentState.draftKey),
          multiPartyStateDraftResponse({
            definition: respondentState.definition,
            state: completedMultiPartyState,
          }),
        );
        setMultiPartyState(completedMultiPartyState);
        setRespondentState((current) =>
          current.status === 'ready'
            ? { ...current, multiPartyState: completedMultiPartyState }
            : current,
        );
        if (!multiPartyComplete(multiPartyPolicy, completedMultiPartyState.progress)) {
          const slots = requiredMultiPartySlots(multiPartyPolicy);
          const nextSlot = slots.find(
            (slot) => slot.partyRef === completedMultiPartyState?.progress.activePartyRef,
          );
          setSubmitState({
            status: 'awaiting-next-party',
            nextPartyLabel: nextSlot?.label ?? 'the next signer',
            signedCount: completedMultiPartyState.progress.signatures.length,
            totalCount: slots.length,
          });
          return;
        }
      }
      const submittedResponse = multiPartyPolicy && completedMultiPartyState
        ? buildMultiPartyAggregateResponse({
            definition: respondentState.definition,
            id: idempotencyKey,
            state: completedMultiPartyState,
          })
        : completedResponse;
      if (multiPartyPolicy && completedMultiPartyState) {
        await composition.draftStore.save(activeDraftKey, submittedResponse);
      }
      const handoff = await buildIntakeHandoff({
        definition: respondentState.definition,
        response: submittedResponse,
        validationReport: result.validationReport,
        draftKey: activeDraftKey,
        claim: respondentState.claim,
        idempotencyKey,
        multiParty: multiPartyPolicy && completedMultiPartyState
          ? {
              policy: multiPartyPolicy,
              progress: completedMultiPartyState.progress,
              activePartyRef: completedMultiPartyState.progress.activePartyRef,
            }
          : undefined,
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
            onSubmitConfirmedRef.current?.(paymentOutcome.confirmation);
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
            onSubmitConfirmedRef.current?.(paymentOutcome.confirmation);
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
        onSubmitConfirmedRef.current?.(outcome.confirmation);
        setSubmitState({ status: 'confirmed', confirmation: outcome.confirmation });
      } else {
        setSubmitState({
          status: 'queued',
          idempotencyKey: outcome.queuedSubmit.idempotencyKey,
        });
      }
    } catch (error) {
      setSubmitState({ status: 'error', error });
    } finally {
      submissionInProgressRef.current = false;
    }
  };

  const handleClearTerminal = async (): Promise<void> => {
    if (terminalClearRequestedRef.current) return;
    terminalClearRequestedRef.current = true;
    respondentState.ownedRuntime?.invalidate();
    setTerminalClearState({ status: 'clearing' });
    const title = chromeText(respondentState.engine, 'receipt.clearedTitle');
    const detail = chromeText(respondentState.engine, 'receipt.clearedDetail');
    try {
      // Finish existing writes before deleting bindings; the handler guard refuses new ones.
      await localeSaveQueue.current;
      await clearPublicTerminalDraftState({
        draftStore: composition.draftStore,
        draftKey: respondentState.draftKey,
        multiPartyPolicy: respondentState.runtimeProfile.multiParty,
        multiPartyState,
        subjectRef: respondentState.claim?.subjectRef,
      });
      if (respondentState.claim && respondentState.claim.privacyTier !== 'anonymous'
        && (await composition.draftStore.list(respondentState.claim.subjectRef)).length === 0) {
        await composition.identityProvider.revoke(respondentState.claim);
      }
      setSubmitState({ status: 'idle' });
      setRespondentPlaceState({ status: 'disabled' });
      setTerminalClearState({ status: 'cleared' });
      disposeActiveEngine.current?.();
      setRespondentState({ status: 'terminal-cleared', title, detail });
    } catch (error) {
      terminalClearRequestedRef.current = false;
      setTerminalClearState({ status: 'error', error });
    }
  };


  return (
    <AppErrorBoundary>
      <div ref={readyRegion} tabIndex={-1}>
        <RuntimeProfileProvider value={respondentState.runtimeProfile}>
          <AttachmentStoreProvider value={composition.attachmentStore}>
            <FormspecProvider
              engine={respondentState.engine}
              componentDocument={respondentState.componentDocument ?? undefined}
              componentGraph={respondentState.componentGraph ?? undefined}
              hostEvidence={respondentState.hostEvidence ?? undefined}
              themeDocument={form?.themeDocument ?? respondentState.themeDocument ?? undefined}
              registryEntries={form ? [...form.registryEntries] : undefined}
              responseActionsDocument={responseActionsDocument}
              responseActionInvoker={responseActionInvoker}
              semanticControlScope={respondentState.ownedRuntime?.semanticControlScope ?? form?.semanticControlScope}
              components={{
                fields: {
                  Text: SafeAddressTextField,
                  TextInput: SafeAddressTextField,
                  DatePicker: SafeAddressTextField,
                  NumberInput: SafeAddressTextField,
                  FileUpload: FormspecWebAttachmentControl,
                },
              }}
              onSubmit={respondentState.ownedRuntime ? undefined : (result) => {
                void handleSubmit(result);
              }}
              onActionResult={(result) => {
                const action = result.resolution.action;
                if (!action) return;
                if (renderMode === 'surface-slot') {
                  const completed = completedRespondentAction(result);
                  if (completed) {
                    const owner = respondentState.ownedRuntime;
                    try {
                      setCompletedAction({ action: completed, result, owner,
                        generation: owner?.getCompletionGeneration ? completionGeneration(owner) : undefined });
                    } catch { /* A malformed or retired marker cannot advance a route. */ }
                  }
                  return;
                }
                composition.surfaceRouter?.transitionAfterResponseAction({
                  actionId: action.id,
                  status: result.status,
                  componentGraph: respondentState.componentGraph,
                });
              }}
            >
              {localeSaveError ? (
                <LocaleSaveErrorNotice />
              ) : null}
              {renderMode === 'surface-slot' ? (
                <RespondentFormContent
                  renderMode={renderMode}
                  claim={respondentState.claim}
                  composition={composition}
                  definition={respondentState.definition}
                  draftKey={respondentState.draftKey}
                  multiPartyState={multiPartyState}
                  notificationDelivery={composition.notificationDelivery}
                  onClearTerminal={handleClearTerminal}
                  respondentPlaceState={respondentPlaceState}
                  runtimeProfile={respondentState.runtimeProfile}
                  submitState={submitState}
                  terminalClearState={terminalClearState}
                />
              ) : (
                <RespondentSurface
                  localeDocuments={respondentState.localeDocuments}
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
                  multiPartyState={multiPartyState}
                  submitState={submitState}
                  terminalClearState={terminalClearState}
                  notificationDelivery={composition.notificationDelivery}
                  onClearTerminal={handleClearTerminal}
                  onStartCurrent={handleStartCurrent}
                  onLocaleChange={handleLocaleChange}
                />
              )}
            </FormspecProvider>
          </AttachmentStoreProvider>
        </RuntimeProfileProvider>
      </div>
    </AppErrorBoundary>
  );
}

/**
 * A completed terminal held across the confirmation wait. Surface's boundary
 * takes the action and its invocation result together, so the host cannot
 * reduce the terminal to its action and rebuild the rest later.
 */
interface CompletedRespondentAction {
  readonly owner?: RespondentOwnedRuntime;
  readonly generation?: string | number;
  readonly action: ResponseAction;
  readonly result: ResponseActionInvocationResult<SubmitResult>;
}

function completionGeneration(runtime: RespondentOwnedRuntime): string | number {
  const value = runtime.getCompletionGeneration!();
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Owned action completion generation is unavailable');
  }
  return value;
}

/**
 * Same successful-terminal boundary used by Surface's default Definition
 * renderer. The host keeps this check because its transport confirmation is
 * deliberately later than the synchronous Response Actions terminal.
 */
function completedRespondentAction(
  result: ResponseActionInvocationResult<SubmitResult>,
): ResponseAction | undefined {
  if (result.status !== 'completed') return undefined;
  if (!result.resolution.resolved || !result.resolution.action) return undefined;
  if (result.detail?.validationReport?.valid !== true) return undefined;
  return result.resolution.action;
}

function SafeAddressTextField(props: FieldComponentProps) {
  const runtimeProfile = useResolvedRuntimeProfile();
  const config = getSafeAddressRuntimeConfig(runtimeProfile);
  const protectedField = config?.fields.find((field) => sameFieldPath(field.path, props.field.path));
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  if (!protectedField) {
    return <DefaultField {...props} />;
  }
  const { field, node } = props;
  const graphAttrs = projectionMetadataAttrs(node);
  const showPlaintext = focused || revealed;
  const maskToken = config?.rendererHints?.maskRenderToken ?? '(protected)';
  const revealLabel = config?.rendererHints?.revealAffordanceLabel ?? 'Reveal protected value';
  const value = field.value == null ? '' : String(field.value);
  const displayValue = showPlaintext ? value : maskToken;
  const showError = !!(field.error && field.touched);
  const descriptionId = field.description ? `${field.id}-desc` : undefined;
  const hintId = field.hint ? `${field.id}-hint` : undefined;
  const describedBy = [descriptionId, hintId].filter(Boolean).join(' ') || undefined;
  const requiredNode = field.required ? (
    <abbr className="formspec-required usa-label--required" title="required">
      {' *'}
    </abbr>
  ) : null;
  return (
    <div
      className="formspec-field formspec-safe-address-field"
      data-name={field.path}
      style={node.style}
      {...graphAttrs}
    >
      <label
        htmlFor={field.id}
        className={node.labelPosition === 'hidden' ? 'formspec-label formspec-sr-only' : 'formspec-label'}
      >
        {field.label}
        {requiredNode}
      </label>
      {field.description ? (
        <div id={descriptionId} className="formspec-description">
          {field.description}
        </div>
      ) : null}
      {field.hint ? (
        <p id={hintId} className="formspec-hint">
          {field.hint}
        </p>
      ) : null}
      <div className="formspec-input-adornment">
        <input
          id={field.id}
          name={field.path}
          className="formspec-input"
          type="text"
          value={displayValue}
          readOnly={field.readonly || !showPlaintext}
          required={field.required}
          aria-invalid={showError}
          aria-required={field.required}
          aria-describedby={describedBy}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setRevealed(false);
            field.touch();
          }}
          onChange={(event) => {
            if (showPlaintext) field.setValue(event.currentTarget.value);
          }}
        />
        <button
          type="button"
          className="formspec-safe-address-field__reveal"
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? 'Hide protected value' : revealLabel}
        </button>
      </div>
      <p id={`${field.id}-error`} className="formspec-error" aria-live="polite">
        {showError ? field.error : ''}
      </p>
    </div>
  );
}

function sameFieldPath(configPath: string, runtimePath: string): boolean {
  return configPath === runtimePath || configPath.replace(/^\//, '') === runtimePath.replace(/^\//, '');
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
  // Stateful providers replay their normalized current claim synchronously.
  // Reuse an admitted identity before allocating a subject-bound runtime.
  let currentClaim: IdentityClaim | null = null;
  const release = identityProvider.subscribe(claim => { currentClaim = claim; });
  release();
  if (currentClaim && identityClaimAllowedForPolicy(currentClaim, pickerPolicy)) {
    return { options, claim: currentClaim };
  }
  const pickerWillRender = pickerPolicy
    ? signInOptionsForIdentityPolicy({ options, ...pickerPolicy }).length > 0
    : false;
  const option = selectBootIdentityOption(options, pickerWillRender);
  return {
    options,
    claim: option ? await identityProvider.authenticate(option) : null,
  };
}

function identityClaimAllowedForPolicy(
  claim: IdentityClaim | null,
  policy?: { identityMode: IdentityPolicyConfig['mode']; runtimeMode: 'demo' | 'production' },
): boolean {
  return policy?.runtimeMode !== 'production' || policy.identityMode !== 'oidc-required' || claim?.credentialType === 'oidc-token';
}

async function createReadyState(
  composition: Composition,
  config: FormspecWebConfig,
  claim: IdentityClaim | null,
  options: { locale?: string } = {},
  form?: ResolvedRespondentFormInput,
  exchangeEngine?: RespondentOwnedRuntimeInput['exchangeEngine'],
): Promise<ReadyRespondentState | Extract<RespondentState, { status: 'auth-required' | 'draft-conflict' | 'submitted' }>> {
  assertIdentityPolicySatisfied({
    claim,
    identityMode: config.identity.mode,
    runtimeMode: composition.mode,
  });
  const definition = form?.definition ?? await composition.definitionSource.getDefinition(
    composition.initialDefinitionUrl,
  );
  let formAssuranceFloor: AssuranceLevel | undefined;
  try {
    formAssuranceFloor = formAssuranceFloorForDefinition(definition);
  } catch (cause) {
    throw new InvalidRuntimePolicyError(
      'form',
      `metadata.assurance is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
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

  if (!identityClaimMeetsAssurance(claim, formAssuranceFloor)) {
    const discoveredOptions = (
      await composition.identityProvider.discover(formAssuranceFloor)
    ).filter((option) => idpOptionMeetsAssurance(option, formAssuranceFloor));
    const signInOptions = signInOptionsForIdentityPolicy({
      options: discoveredOptions,
      identityMode: config.identity.mode,
      runtimeMode: composition.mode,
    });
    if (signInOptions.length === 0) {
      throw new InvalidRuntimePolicyError(
        'form',
        `metadata.assurance requires ${formAssuranceFloor}, but no configured identity provider can satisfy it`,
      );
    }
    return {
      status: 'auth-required',
      options: signInOptions,
      authenticating: false,
      reason: 'assurance-step-up',
      assuranceFloor: formAssuranceFloor,
    };
  }

  let activeLocale =
    options.locale
    ?? form?.activeLocale
    ?? defaultLocaleForDefinition(definition);
  const [
    localeDocuments,
    componentDocument,
    componentGraph,
    hostEvidence,
    themeDocument,
    authoredResponseActions,
  ] = form
    ? [
        form.localeDocuments,
        form.componentDocument,
        undefined,
        undefined,
        form.themeDocument,
        form.responseActionsDocument,
      ] as const
    : await Promise.all([
        composition.definitionSource.getLocaleDocuments?.(composition.initialDefinitionUrl),
        composition.definitionSource.getComponentDocument?.(composition.initialDefinitionUrl),
        composition.definitionSource.getComponentGraphContext?.(composition.initialDefinitionUrl),
        composition.definitionSource.getLayoutHostEvidence?.(composition.initialDefinitionUrl),
        composition.definitionSource.getThemeDocument?.(composition.initialDefinitionUrl),
        composition.definitionSource.getResponseActionsDocument?.(composition.initialDefinitionUrl),
      ]);
  const verifiedComponentGraph = componentGraphHasCompletedEvidence({ componentGraph, hostEvidence })
    ? componentGraph ?? null
    : null;

  if (uiGraphPolicyHidesDefinitionOnActiveRoute({ definition, componentGraph: verifiedComponentGraph, hostEvidence })) {
    throw new HiddenDefinitionRuntimeStateError(definition.url);
  }

  const draftKey: DraftKey = {
    formUrl: definition.url,
    formVersion: definition.version,
    subjectRef: claim?.subjectRef,
  };
  let recoveredDraft: FormResponse | undefined;
  let recoveredSigning: SignedResponseSigning | undefined;
  let recoveredApplication: ApplicationCaseReceipt | undefined;
  let recoveredApplicationLookup: ApplicationCaseLookupUnavailable | undefined;
  if (form?.configureSubmittedRuntime) {
    if (!composition.draftStore.readState || !form.configureRuntime || runtimeProfile.multiParty) {
      throw new Error('Submitted recovery requires its complete qualified runtime');
    }
    const state = await composition.draftStore.readState(draftKey);
    if (state !== undefined && state.kind !== 'active' && state.kind !== 'submitted') {
      throw new Error('Submitted recovery returned an unknown draft state');
    }
    if (state?.kind === 'submitted') {
      const terminalRuntime = await form.configureSubmittedRuntime({ definition, draftKey, claim, state });
      if (!terminalRuntime || typeof terminalRuntime.invalidate !== 'function' || typeof terminalRuntime.dispose !== 'function') {
        terminalRuntime?.dispose?.();
        throw new Error('Submitted recovery requires lifecycle hooks');
      }
      return { status: 'submitted', terminalRuntime };
    }
    recoveredDraft = state?.response;
    recoveredSigning = state?.kind === 'active' ? state.signed : undefined;
    recoveredApplication = state?.application;
    recoveredApplicationLookup = state?.applicationLookup;
  }
  const engine = createFormEngine(definition, {
    runtimeContext: { locale: activeLocale },
    ...(form ? { registryEntries: [...form.registryEntries], instanceSourceResolver: form.instanceSourceResolver,
      ...(form.instanceSourceResolver && recoveredDraft ? { responseData: recoveredDraft.data as Parameters<IFormEngine['loadResponseData']>[0] } : {}) } : {}),
  });
  let multiPartyState: MultiPartyPersistedState | null;
  let draft: FormResponse | undefined;
  let ownedRuntime: RespondentOwnedRuntime | undefined;
  try {
    for (const localeDocument of localeDocuments ?? []) {
      engine.loadLocale(localeDocument);
    }
    multiPartyState = runtimeProfile.multiParty
      ? multiPartyStateFromDraft(
          await composition.draftStore.load(multiPartyProgressDraftKey(draftKey)),
          runtimeProfile.multiParty,
        )
      : null;
    draft = form?.configureSubmittedRuntime ? recoveredDraft : await composition.draftStore.load(
      multiPartyState
        ? multiPartyDraftKey(draftKey, multiPartyState.progress.activePartyRef)
        : draftKey,
    );

  } catch (error) {
    if (error instanceof DraftVersionConflictError) {
      engine.setLocale(activeLocale);
      return {
        status: 'draft-conflict', error, engine, definition,
        localeDocuments: localeDocuments ?? [], activeLocale,
      };
    }
    engine.dispose();
    throw error;
  }
  try {
    if (draft && options.locale === undefined) {
      activeLocale = restoreDraftLocale(engine, draft, definition, localeDocuments ?? []);
    } else {
      engine.setLocale(activeLocale);
    }
    hydrateEngineFromResponse(engine, draft);
    const resolvedIssuer = await engine.getResolvedIssuer();
    if (form?.configureRuntime) {
      if (runtimeProfile.enabled.has('trustedReviewer')) {
        throw new Error('An owned action runtime cannot use the legacy reviewer draft writer');
      }
      const configured = await form.configureRuntime({ engine, definition, exchangeEngine,
        draftKey: multiPartyState ? multiPartyDraftKey(draftKey, multiPartyState.progress.activePartyRef) : draftKey, claim,
        restoredResponse: draft ? structuredClone(draft) : undefined, restoredSigning: recoveredSigning, restoredApplication: recoveredApplication,
        restoredApplicationLookup: recoveredApplicationLookup, activeLocale });
      if (!configured || typeof configured.responseActionInvoker !== 'function'
        || typeof configured.invalidate !== 'function'
        || typeof configured.dispose !== 'function'
        || (configured.afterMount !== undefined && typeof configured.afterMount !== 'function')
        || (configured.getCompletionGeneration !== undefined && typeof configured.getCompletionGeneration !== 'function')) {
        configured?.dispose?.();
        throw new Error('An owned action runtime must supply its complete execution and lifecycle hooks');
      }
      let disposed = false;
      ownedRuntime = { ...configured, dispose: () => {
        if (disposed) return;
        disposed = true;
        configured.dispose();
      } };
    }

    return {
      status: 'ready',
      definition,
      localeDocuments: localeDocuments ?? [],
      themeDocument: themeDocument ?? null,
      responseActionsDocument: authoredResponseActions ?? null,
      componentDocument: componentDocument ?? null,
      componentGraph: verifiedComponentGraph,
      hostEvidence: hostEvidence ?? null,
      engine,
      draftKey,
      claim,
      resolvedIssuer,
      activeLocale,
      draftLoaded: draft !== undefined,
      multiPartyState,
      runtimeProfile,
      ...(ownedRuntime ? { ownedRuntime } : {}),
    };
  } catch (error) {
    ownedRuntime?.dispose();
    engine.dispose();
    throw error;
  }
}

/** ADR 0082 D16.2: resume the saved wording before hydrating any answers. */
function restoreDraftLocale(
  engine: IFormEngine,
  draft: FormResponse,
  definition: FormDefinition,
  documents: readonly LocaleDocument[],
): string {
  const pin = draft.displayedLocale;
  if (!pin) {
    engine.setLocale('');
    return '';
  }
  const matches = documents.filter(document => (
    document.target.kind === 'definition'
    && document.target.url === definition.url
    && document.locale.toLowerCase() === pin.locale.toLowerCase()
    && document.version === pin.version
    && document.url === pin.url
  ));
  if (matches.length !== 1) {
    throw new Error('The saved draft language document is unavailable or no longer matches its saved version.');
  }
  engine.setLocale(matches[0].locale);
  const resolved = engine.getResponse({ profile: 'off' }).displayedLocale;
  if (!resolved || resolved.url !== pin.url || resolved.version !== pin.version
    || resolved.locale.toLowerCase() !== pin.locale.toLowerCase()) {
    throw new Error('The loaded language document does not match the saved draft language.');
  }
  return resolved.locale;
}

function componentGraphHasCompletedEvidence(input: {
  componentGraph: ComponentGraphProjectionContext | null | undefined;
  hostEvidence: LayoutHostEvidence | null | undefined;
}): boolean {
  const { componentGraph, hostEvidence } = input;
  const evidence = hostEvidence?.componentGraphContexts;
  if (!componentGraph || !Array.isArray(evidence) || evidence.length === 0) {
    return false;
  }

  const validatedContextSources = validatedComponentGraphContextEvidenceSources(hostEvidence?.appGraphReport);
  if (validatedContextSources.size === 0) {
    return false;
  }

  return evidence.some((entry, index) => {
    if (!isComponentGraphProjectionEvidenceLike(entry)) return false;
    const evidenceSlot = `hostEvidence.componentGraphContexts[${index}]`;
    if (validatedContextSources.get(evidenceSlot) !== entry.source) return false;
    if (entry.schemaId !== COMPONENT_GRAPH_CONTEXT_SCHEMA_ID) return false;
    return componentGraphContextMatches(entry.document, componentGraph);
  });
}

function uiGraphPolicyHidesDefinitionOnActiveRoute({
  definition,
  componentGraph,
  hostEvidence,
}: {
  definition: FormDefinition;
  componentGraph: ComponentGraphProjectionContext | null | undefined;
  hostEvidence: LayoutHostEvidence | null | undefined;
}): boolean {
  const evidence = hostEvidence?.uiGraphPolicies;
  if (!componentGraph || !Array.isArray(evidence) || evidence.length === 0) {
    return false;
  }

  const validatedPolicySources = validatedUiGraphPolicyEvidenceSources(hostEvidence?.appGraphReport);
  if (validatedPolicySources.size === 0) {
    return false;
  }

  const matchingRoutePolicies: unknown[] = [];
  for (const [index, entry] of evidence.entries()) {
    if (!isUiGraphPolicyProjectionEvidenceLike(entry)) continue;
    const evidenceSlot = `hostEvidence.uiGraphPolicies[${index}]`;
    if (validatedPolicySources.get(evidenceSlot) !== entry.source) continue;
    if (entry.schemaId !== UI_GRAPH_POLICY_SCHEMA_ID) continue;
    const document = entry.document;
    if (!isUiGraphPolicyDocumentLike(document)) continue;
    if (!targetSurfaceMatches(document.targetSurface, componentGraph.surface)) continue;
    for (const routePolicy of document.routePolicies) {
      if (routePolicy.routeId === componentGraph.route) {
        matchingRoutePolicies.push(routePolicy);
      }
    }
  }

  if (matchingRoutePolicies.length !== 1) {
    return false;
  }

  const [routePolicy] = matchingRoutePolicies;
  if (!isUiGraphRoutePolicyLike(routePolicy)) {
    return false;
  }
  const hiddenRefs = routePolicy.definitionVisibility?.hiddenDefinitionRefs;
  return Array.isArray(hiddenRefs) &&
    hiddenRefs.some((ref) => hiddenDefinitionRefMatches(ref, definition));
}

function validatedUiGraphPolicyEvidenceSources(
  report: LayoutHostEvidence['appGraphReport'] | undefined,
): Map<string, string> {
  if (
    !report ||
    typeof report !== 'object' ||
    report.ok !== true ||
    !Array.isArray(report.phases) ||
    !Array.isArray(report.evidenceResults)
  ) {
    return new Map();
  }

  const phases = new Map<string, string>();
  for (const phase of report.phases) {
    if (!isAppGraphPhaseLike(phase) || phases.has(phase.phase)) {
      return new Map();
    }
    phases.set(phase.phase, phase.status);
  }
  if (phases.get('schema') !== 'completed' || phases.get('cross-artifact') !== 'completed') {
    return new Map();
  }

  const sourcesBySlot = new Map<string, string>();
  const seenEvidenceSlots = new Set<string>();
  for (const result of report.evidenceResults) {
    if (!isAppGraphEvidenceResultLike(result) || seenEvidenceSlots.has(result.evidenceSlot)) {
      return new Map();
    }
    seenEvidenceSlots.add(result.evidenceSlot);
    if (isCompletedUiGraphPolicyEvidenceResult(result)) {
      sourcesBySlot.set(result.evidenceSlot, result.source);
    }
  }
  return sourcesBySlot;
}

function validatedComponentGraphContextEvidenceSources(
  report: LayoutHostEvidence['appGraphReport'] | undefined,
): Map<string, string> {
  if (
    !report ||
    typeof report !== 'object' ||
    report.ok !== true ||
    !Array.isArray(report.phases) ||
    !Array.isArray(report.evidenceResults)
  ) {
    return new Map();
  }

  const phases = new Map<string, string>();
  for (const phase of report.phases) {
    if (!isAppGraphPhaseLike(phase) || phases.has(phase.phase)) {
      return new Map();
    }
    phases.set(phase.phase, phase.status);
  }
  if (phases.get('schema') !== 'completed' || phases.get('cross-artifact') !== 'completed') {
    return new Map();
  }

  const sourcesBySlot = new Map<string, string>();
  const seenEvidenceSlots = new Set<string>();
  for (const result of report.evidenceResults) {
    if (!isAppGraphEvidenceResultLike(result) || seenEvidenceSlots.has(result.evidenceSlot)) {
      return new Map();
    }
    seenEvidenceSlots.add(result.evidenceSlot);
    if (isCompletedComponentGraphContextEvidenceResult(result)) {
      sourcesBySlot.set(result.evidenceSlot, result.source);
    }
  }
  return sourcesBySlot;
}

function isAppGraphPhaseLike(value: unknown): value is { phase: string; status: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const phase = value as { phase?: unknown; status?: unknown };
  return typeof phase.phase === 'string' && typeof phase.status === 'string';
}

function isAppGraphEvidenceResultLike(value: unknown): value is {
  evidenceSlot: string;
  schemaId: string;
  source: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as {
    evidenceSlot?: unknown;
    schemaId?: unknown;
    source?: unknown;
  };
  return typeof result.evidenceSlot === 'string' &&
    typeof result.schemaId === 'string' &&
    typeof result.source === 'string';
}

function isCompletedUiGraphPolicyEvidenceResult(value: unknown): value is {
  evidenceSlot: string;
  schemaId: typeof UI_GRAPH_POLICY_SCHEMA_ID;
  source: string;
  status: 'completed';
  ok: true;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as {
    evidenceSlot?: unknown;
    schemaId?: unknown;
    source?: unknown;
    status?: unknown;
    ok?: unknown;
  };
  return result.schemaId === UI_GRAPH_POLICY_SCHEMA_ID &&
    result.status === 'completed' &&
    result.ok === true &&
    typeof result.evidenceSlot === 'string' &&
    typeof result.source === 'string';
}

function isCompletedComponentGraphContextEvidenceResult(value: unknown): value is {
  evidenceSlot: string;
  schemaId: typeof COMPONENT_GRAPH_CONTEXT_SCHEMA_ID;
  source: string;
  status: 'completed';
  ok: true;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as {
    evidenceSlot?: unknown;
    schemaId?: unknown;
    source?: unknown;
    status?: unknown;
    ok?: unknown;
  };
  return result.schemaId === COMPONENT_GRAPH_CONTEXT_SCHEMA_ID &&
    result.status === 'completed' &&
    result.ok === true &&
    typeof result.evidenceSlot === 'string' &&
    typeof result.source === 'string';
}

function isComponentGraphProjectionEvidenceLike(value: unknown): value is {
  schemaId: string;
  source: string;
  document: unknown;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as {
    schemaId?: unknown;
    source?: unknown;
  };
  return typeof evidence.schemaId === 'string' && typeof evidence.source === 'string' && 'document' in value;
}

function componentGraphContextMatches(
  value: unknown,
  componentGraph: ComponentGraphProjectionContext,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as {
    component?: unknown;
    surface?: unknown;
    route?: unknown;
  };
  if (!context.component || typeof context.component !== 'object' || Array.isArray(context.component)) return false;
  if (!context.surface || typeof context.surface !== 'object' || Array.isArray(context.surface)) return false;
  const component = context.component as {
    handle?: unknown;
    url?: unknown;
    version?: unknown;
  };
  const surface = context.surface as {
    url?: unknown;
    version?: unknown;
  };
  return component.handle === componentGraph.component.handle &&
    optionalStringMatches(component.url, componentGraph.component.url) &&
    optionalStringMatches(component.version, componentGraph.component.version) &&
    surface.url === componentGraph.surface.url &&
    optionalStringMatches(surface.version, componentGraph.surface.version) &&
    context.route === componentGraph.route;
}

function optionalStringMatches(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return typeof left === 'string' && left === right;
}

function isUiGraphPolicyProjectionEvidenceLike(value: unknown): value is {
  schemaId: string;
  source: string;
  document: unknown;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as { schemaId?: unknown; source?: unknown };
  return typeof evidence.schemaId === 'string' &&
    typeof evidence.source === 'string' &&
    'document' in value;
}

function isUiGraphPolicyDocumentLike(value: unknown): value is {
  $formspecUiGraphPolicy: '0.1';
  targetSurface: { url: string; version?: string };
  routePolicies: Array<{
    routeId: string;
    definitionVisibility?: {
      hiddenDefinitionRefs?: unknown[];
    };
  }>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as {
    $formspecUiGraphPolicy?: unknown;
    targetSurface?: unknown;
    routePolicies?: unknown;
  };
  const targetSurface = document.targetSurface;
  if (
    document.$formspecUiGraphPolicy !== '0.1' ||
    !targetSurface ||
    typeof targetSurface !== 'object' ||
    Array.isArray(targetSurface) ||
    typeof (targetSurface as { url?: unknown }).url !== 'string' ||
    ('version' in targetSurface &&
      typeof (targetSurface as { version?: unknown }).version !== 'string') ||
    !Array.isArray(document.routePolicies)
  ) {
    return false;
  }
  return document.routePolicies.every(isUiGraphRoutePolicyLike);
}

function isUiGraphRoutePolicyLike(value: unknown): value is {
  routeId: string;
  definitionVisibility?: {
    hiddenDefinitionRefs?: unknown[];
  };
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const routePolicy = value as {
    routeId?: unknown;
    definitionVisibility?: unknown;
  };
  if (typeof routePolicy.routeId !== 'string') return false;
  if (!('definitionVisibility' in routePolicy)) return true;
  if (
    !routePolicy.definitionVisibility ||
    typeof routePolicy.definitionVisibility !== 'object' ||
    Array.isArray(routePolicy.definitionVisibility)
  ) {
    return false;
  }
  const visibility = routePolicy.definitionVisibility as {
    hiddenDefinitionRefs?: unknown;
  };
  return !('hiddenDefinitionRefs' in visibility) ||
    Array.isArray(visibility.hiddenDefinitionRefs);
}

function targetSurfaceMatches(
  policySurface: { url: string },
  scopeSurface: ComponentGraphProjectionContext['surface'],
): boolean {
  return policySurface.url === scopeSurface.url;
}

function hiddenDefinitionRefMatches(ref: unknown, definition: FormDefinition): boolean {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
    return false;
  }
  const candidate = ref as { url?: unknown; version?: unknown };
  return candidate.url === definition.url &&
    (candidate.version === undefined || candidate.version === definition.version);
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

function DraftRecoveryPanel({ state, clearState, onStart, onLocaleChange, headingLevel }: {
  state: Extract<RespondentState, { status: 'draft-conflict' }>;
  headingLevel: 'h1' | 'h2';
  clearState: TerminalClearState;
  onStart: () => void;
  onLocaleChange: (locale: string) => void;
}) {
  const chrome = useChromeText();
  const Heading = headingLevel;
  const errorHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (clearState.status === 'error') errorHeading.current?.focus();
  }, [clearState.status]);
  const options = localeOptionsForDefinition(state.definition, state.localeDocuments);
  return <section className="shell__status" aria-labelledby="draft-recovery-title">
    <Heading id="draft-recovery-title" tabIndex={-1} ref={errorHeading}>{chrome('draft.versionChangedTitle')}</Heading>
    <p>{chrome('draft.versionChanged', { version: state.error.retainedVersion ?? '' })}</p>
    <p>{chrome('draft.browserAccessNotice')}</p>
    <div className="respondent-toolbar__group" role="group" aria-label={chrome('form.language')}>
      {options.map(option => <button key={option.code} type="button" className="locale-button"
        disabled={clearState.status === 'clearing'} aria-pressed={state.activeLocale.toLowerCase() === option.code.toLowerCase()}
        onClick={() => onLocaleChange(option.code)}>{option.label}</button>)}
    </div>
    <button type="button" className="locale-button" disabled={clearState.status === 'clearing'} onClick={onStart}>
      {chrome(clearState.status === 'clearing' ? 'draft.startingCurrent' : 'draft.startCurrent')}
    </button>
    {clearState.status === 'error' ? <p role="alert">{chrome('draft.startCurrentFailed')}</p> : null}
  </section>;
}

function LocaleSaveErrorNotice() {
  const chrome = useChromeText();
  return <p role="alert">{chrome('form.languageSaveFailed')}</p>;
}

function RespondentSurface({
  localeDocuments,
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
  multiPartyState,
  submitState,
  terminalClearState,
  notificationDelivery,
  onClearTerminal,
  onLocaleChange,
  onStartCurrent,
}: {
  localeDocuments: readonly LocaleDocument[];
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
  multiPartyState: MultiPartyPersistedState | null;
  submitState: SubmitState;
  terminalClearState: TerminalClearState;
  notificationDelivery?: NotificationDelivery;
  onClearTerminal: () => Promise<void>;
  onLocaleChange: (locale: string) => void;
  onStartCurrent: () => Promise<void>;
}) {
  const { engine } = useFormspecContext();
  const chrome = useChromeText();
  const localeOptions = useMemo(() => localeOptionsForDefinition(definition, localeDocuments), [definition, localeDocuments]);
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
          <h1 id="respondent-title" tabIndex={-1}>{title}</h1>
          {description ? <p>{description}</p> : null}
        </header>
      )}

      <div className="respondent-toolbar" aria-label={chrome('form.settings')}>
        <div className="respondent-toolbar__group" role="group" aria-label={chrome('form.language')}>
          {localeOptions.map((option) => (
            <button
              aria-pressed={activeLocale.toLowerCase() === option.code.toLowerCase()}
              disabled={submissionLocksLocale(submitState)
                || terminalClearState.status === 'clearing' || terminalClearState.status === 'cleared'}
              className="locale-button"
              key={option.code}
              type="button"
              onClick={() => onLocaleChange(option.code)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!submissionLocksLocale(submitState) ? <div>
          <button type="button" className="locale-button" disabled={terminalClearState.status === 'clearing'}
            onClick={() => { void onStartCurrent(); }}>
            {chrome(terminalClearState.status === 'clearing' ? 'draft.startingCurrent' : 'draft.startCurrent')}
          </button>
          {terminalClearState.status === 'error' ? <p role="alert">{chrome('draft.startCurrentFailed')}</p> : null}
        </div> : null}
        <div className="respondent-toolbar__meta" aria-live="polite">
          {draftLoaded ? chrome('localPreview.draftRestored') : composition.localPackagePreview ? chrome('localPreview.preview') : mode}
        </div>
      </div>

      {composition.localPackagePreview && submitState.status !== 'confirmed' ? (
        <p className="respondent-preview-note" role="note">
          {chrome('receipt.pendingFilingAndSigning')}
        </p>
      ) : null}
      <RespondentFormContent
        claim={claim}
        composition={composition}
        definition={definition}
        draftKey={draftKey}
        multiPartyState={multiPartyState}
        notificationDelivery={notificationDelivery}
        onClearTerminal={onClearTerminal}
        respondentPlaceState={respondentPlaceState}
        runtimeProfile={runtimeProfile}
        submitState={submitState}
        terminalClearState={terminalClearState}
      />
    </>
  );
}

function RespondentFormContent({
  renderMode,
  claim,
  composition,
  definition,
  draftKey,
  multiPartyState,
  notificationDelivery,
  onClearTerminal,
  respondentPlaceState,
  runtimeProfile,
  submitState,
  terminalClearState,
}: {
  renderMode?: 'standalone' | 'surface-slot';
  claim: IdentityClaim | null;
  composition: Composition;
  definition: FormDefinition;
  draftKey: DraftKey;
  multiPartyState: MultiPartyPersistedState | null;
  notificationDelivery?: NotificationDelivery;
  onClearTerminal: () => Promise<void>;
  respondentPlaceState: RespondentPlaceState;
  runtimeProfile: ResolvedRuntimeProfile;
  submitState: SubmitState;
  terminalClearState: TerminalClearState;
}) {
  const { layoutPlan } = useFormspecContext();
  const chrome = useChromeText();
  return (
    <>
      <SubmitNotice state={submitState} />
      <RespondentPlacePanel state={respondentPlaceState} />
      <TrustedReviewerPanel
        claim={claim}
        composition={composition}
        definition={definition}
        draftKey={multiPartyState?.progress.activePartyRef
          ? multiPartyDraftKey(draftKey, multiPartyState.progress.activePartyRef)
          : draftKey}
        runtimeProfile={runtimeProfile}
      />
      <MultiPartyPanel
        progress={multiPartyState?.progress ?? null}
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
          <h2 className="sr-only" tabIndex={-1}>{chrome('form.fields')}</h2>
          {renderMode === 'surface-slot' ? <FormspecFormContent /> : <FormspecNode node={layoutPlan} />}
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
        partyRef: draftKey.partyRef,
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

function MultiPartyPanel({
  progress,
  runtimeProfile,
}: {
  progress: MultiPartySignerProgress | null;
  runtimeProfile: ResolvedRuntimeProfile;
}) {
  const policy = runtimeProfile.multiParty;
  if (!policy) return null;
  const slots = requiredMultiPartySlots(policy);
  const activeRef = progress?.activePartyRef ?? slots[0]?.partyRef;
  const signedRefs = new Set(progress?.signatures.map((signature) => signature.partyRef) ?? []);
  const activeSlot = slots.find((slot) => slot.partyRef === activeRef);
  return (
    <section className="respondent-place" aria-labelledby="multi-party-title">
      <div className="respondent-place__header">
        <div>
          <p className="respondent-header__kicker">Joint submission</p>
          <h2 id="multi-party-title">Signer progress</h2>
        </div>
        <p className="respondent-place__trust">{policy.tier}</p>
      </div>
      <p>
        Current signer: <strong>{activeSlot?.label ?? 'Signer'}</strong>
      </p>
      <ul className="trusted-reviewer__shares">
        {slots.map((slot) => (
          <li key={slot.partyRef}>
            <span>{slot.label}</span>
            <small>{signedRefs.has(slot.partyRef) ? 'signed' : 'waiting'}</small>
          </li>
        ))}
      </ul>
    </section>
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
      <h1 id="respondent-title" tabIndex={-1}>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

export function AuthRequiredSurface({
  authenticating,
  error,
  headingLevel = 'h1',
  options,
  reason,
  onSignIn,
}: {
  authenticating: boolean;
  error?: unknown;
  headingLevel?: 'h1' | 'h2';
  options: IdpOption[];
  reason: 'initial-sign-in' | 'assurance-step-up';
  onSignIn: (option: IdpOption) => void;
}) {
  const detail = error ? problemDetail(error) : undefined;
  // FW-0028: heading switches to picker copy when the deployment offers a
  // real choice. Single-option deployments keep the focused "Sign in to
  // continue" call-to-action.
  const heading = reason === 'assurance-step-up'
    ? 'Use a stronger sign-in'
    : options.length > 1
      ? 'Choose how to sign in'
      : 'Sign in to continue';
  const body = reason === 'assurance-step-up'
    ? 'This form needs a stronger sign-in before it can be loaded. Choose one of the listed options to continue.'
    : 'Sign in to continue with this form.';
  const Heading = headingLevel;
  return (
    <section className="auth-required" aria-labelledby="auth-required-title">
      <p className="respondent-header__kicker">Sign in required</p>
      <Heading id="auth-required-title">{heading}</Heading>
      <p>{body}</p>
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
  if (state.status === 'awaiting-next-party') {
    return (
      <section className="submit-notice" role="status" aria-live="polite">
        <h2>Saved for the next signer</h2>
        <p>
          {state.nextPartyLabel} can review their part and sign next.
        </p>
        <p className="submit-notice__detail">
          {state.signedCount} of {state.totalCount} signers have signed. The form will be sent after every required signer signs.
        </p>
      </section>
    );
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
  resolveChromeText,
  pendingFilingAndSigning = true,
  focusOnMount = false,
}: {
  confirmation: SubmitReceiptReference;
  resolveChromeText?: (key: ChromeStringKey) => string;
  pendingFilingAndSigning?: boolean;
  focusOnMount?: boolean;
  captureReceipt?: CaptureReceipt;
  notificationDelivery?: NotificationDelivery;
  terminalClearState?: TerminalClearState;
  onClearTerminal?: () => Promise<void> | void;
}) {
  const smsInputId = useId();
  const actionsHeadingId = useId();
  const defaultChrome = useChromeText();
  const chrome = resolveChromeText ?? defaultChrome;
  const receipt = useRef<HTMLElement>(null);
  useEffect(() => { if (focusOnMount) receipt.current?.focus(); }, [focusOnMount]);
  const [smsTo, setSmsTo] = useState('');
  const [smsState, setSmsState] = useState<
    { status: 'idle' } | { status: 'sending' } | { status: 'sent' } | { status: 'error'; error: string }
  >({ status: 'idle' });
  const trackingHref = confirmation.caseUrn
    ? buildConfirmationTrackingUri(confirmation.caseUrn)
    : confirmation.trackingUri;
  const trackingLabel = confirmation.caseUrn ? 'Track this application' : 'Track this submission';
  const responseOnly = confirmation.recordKind === 'response' && !confirmation.caseUrn;
  const verifierCode = responseOnly ? null : publicTerminalVerifierCode(confirmation);
  const canSendSmsReceipt = !responseOnly && canSendPublicTerminalReceiptSms(notificationDelivery);

  const handleSmsSend = async (): Promise<void> => {
    if (!canSendSmsReceipt) return;
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
    <section className="confirmation-panel" ref={receipt} aria-labelledby="confirmation-title" tabIndex={-1}>
      <h2 id="confirmation-title">{responseOnly ? chrome('receipt.answersReceived') : 'Submission received'}</h2>
      <p>{responseOnly ? chrome('receipt.submissionId') : 'Reference number'}</p>
      <strong className={responseOnly ? 'confirmation-panel__submission-id' : undefined}>{confirmation.referenceNumber}</strong>
      {responseOnly ? (
        pendingFilingAndSigning ? <p>{chrome('receipt.pendingFilingAndSigning')}</p> : null
      ) : (
        <p>Verifier code <strong>{verifierCode}</strong></p>
      )}
      {trackingHref ? <a href={trackingHref}>{trackingLabel}</a> : null}
      {captureReceipt ? <PaymentReceivedSubCard captureReceipt={captureReceipt} /> : null}
      <div className="public-terminal-actions" aria-labelledby={actionsHeadingId}>
        <h3 id={actionsHeadingId}>{responseOnly ? chrome('receipt.keepRecord') : 'Keep your proof'}</h3>
        <p>
          {canSendSmsReceipt
            ? 'Print this confirmation, text it to a phone you control, then clear this computer before leaving.'
            : responseOnly ? chrome('receipt.printInstruction') : 'Print this confirmation, then clear this computer before leaving.'}
        </p>
        <div className="public-terminal-actions__row">
          <button type="button" onClick={printConfirmation}>
            {responseOnly ? chrome('receipt.print') : 'Print confirmation'}
          </button>
          {onClearTerminal ? (
            <button
              type="button"
              className="public-terminal-actions__secondary"
              disabled={terminalClearState.status === 'clearing' || terminalClearState.status === 'cleared'}
              onClick={() => {
                void onClearTerminal();
              }}
            >
              {responseOnly
                ? chrome(terminalClearState.status === 'clearing' ? 'receipt.clearing' : 'receipt.clear')
                : terminalClearState.status === 'clearing' ? 'Clearing...' : 'Clear this computer'}
            </button>
          ) : null}
        </div>
        {canSendSmsReceipt ? (
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

function TerminalClearedPanel({
  title, detail,
  headingLevel = 'h1',
}: {
  title: string; detail: string;
  headingLevel?: 'h1' | 'h2';
}) {
  const Heading = headingLevel;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="shell__status" role="status">
      <Heading ref={heading} tabIndex={-1}>{title}</Heading>
      <p>{detail}</p>
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

function RuntimePolicyErrorPage({
  error,
  headingLevel = 'h1',
}: {
  error: RuntimePolicyError;
  headingLevel?: 'h1' | 'h2';
}) {
  const Heading = headingLevel;
  return (
    <div className="shell__status shell__status--error" role="alert">
      <Heading>This form cannot be loaded.</Heading>
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
  if (error instanceof HiddenDefinitionRuntimeStateError) {
    return 'This form is not available on this route. Try again later, or contact the sender for help.';
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
    if (error.featureKey === 'multiParty') {
      return 'This form requires multiple signers, but this site is not set up for joint submissions.';
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
