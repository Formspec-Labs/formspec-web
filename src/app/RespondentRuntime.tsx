import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
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
import type { FormspecWebConfig } from '../config/types.ts';
import {
  defaultLocaleForDefinition,
  demoLocaleDocuments,
  localeOptionsForDefinition,
} from '../demo/locales.ts';
import type { Composition } from '../composition/types.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { IdentityClaim, IdentityProvider, IdpOption } from '../ports/identity-provider.ts';
import type {
  ApplicantStatusResource,
  RespondentDocumentRecord,
  RespondentObligation,
  RespondentPlaceSnapshot,
  RespondentSubmissionRecord,
} from '../ports/index.ts';
import type { SubmitConfirmation } from '../ports/submit-transport.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import { isProblemJson, type ProblemJson } from '../shared/problem-json.ts';
import {
  anyEnabledFeatureIsLocaleConditional,
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type ResolvedRuntimeProfile,
  type RuntimePolicyError,
} from '../policy/index.ts';
import { RuntimeProfileProvider } from './RuntimeProfileProvider.tsx';
import {
  assertIdentityPolicySatisfied,
  buildIntakeHandoff,
  hydrateEngineFromResponse,
  identitySubjectChanged,
  isIdentityInteractionStarted,
  selectBootIdentityOption,
  signInOptionsForIdentityPolicy,
  subjectRefInvalidatedByIdentityChange,
} from './respondent-flow.ts';

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
  | { status: 'error'; error: unknown };

type ReadyRespondentState = Extract<RespondentState, { status: 'ready' }>;

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; error: unknown }
  | { status: 'confirmed'; confirmation: SubmitConfirmation };

type RespondentPlaceState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | {
      status: 'ready';
      snapshot: RespondentPlaceSnapshot;
      submissionStatuses: Record<string, ApplicantStatusResource>;
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
    setRespondentState({ status: 'loading' });
    setSubmitState({ status: 'idle' });

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
      const boot = await bootIdentity(composition.identityProvider);
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
      unsubscribe = composition.identityProvider.subscribe((nextClaim) => {
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

  useEffect(() => {
    if (respondentState.status !== 'ready') {
      setRespondentPlaceState({ status: 'loading' });
      return;
    }

    // ADR-0011 §Failure Semantics: disabled features render hidden, not as
    // adapter errors. With both seeded features disabled the panel is
    // suppressed entirely; with respondentPlace disabled we don't call the
    // (potentially unavailable) adapter at all.
    if (!respondentState.runtimeProfile.enabled.has('respondentPlace')) {
      setRespondentPlaceState({ status: 'disabled' });
      return;
    }

    let cancelled = false;
    setRespondentPlaceState({ status: 'loading' });
    void loadRespondentPlace(composition, placeSubjectRef, respondentState.runtimeProfile)
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
  }, [composition, placeSubjectRef, respondentState]);

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
    if (submitState.status === 'submitting' || submitState.status === 'confirmed') {
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
      const confirmation = await composition.submitTransport.submit(handoff, idempotencyKey);
      setSubmitState({ status: 'confirmed', confirmation });
    } catch (error) {
      setSubmitState({ status: 'error', error });
    }
  };

  return (
    <AppErrorBoundary>
      <RuntimeProfileProvider value={respondentState.runtimeProfile}>
        <FormspecProvider
          engine={respondentState.engine}
          responseActionsDocument={responseActionsDocument}
          onSubmit={(result) => {
            void handleSubmit(result);
          }}
        >
          <RespondentSurface
            activeLocale={respondentState.activeLocale}
            brandName={config.brand.name}
            definition={respondentState.definition}
            draftLoaded={respondentState.draftLoaded}
            mode={composition.mode}
            respondentPlaceState={respondentPlaceState}
            resolvedIssuer={respondentState.resolvedIssuer}
            submitState={submitState}
            onLocaleChange={handleLocaleChange}
          />
        </FormspecProvider>
      </RuntimeProfileProvider>
    </AppErrorBoundary>
  );
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
  const runtimeProfile = resolveRuntimeFeatures({
    mode: composition.mode,
    instance: composition.instanceCapabilities,
    org: composition.orgRuntimePolicy,
    form: composition.getFormRuntimePolicy(definition),
  });
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
  for (const localeDocument of demoLocaleDocuments) {
    if (localeDocument.targetDefinition.url === definition.url) {
      engine.loadLocale(localeDocument);
    }
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
  definition,
  draftLoaded,
  mode,
  respondentPlaceState,
  resolvedIssuer,
  submitState,
  onLocaleChange,
}: {
  activeLocale: string;
  brandName: string;
  definition: FormDefinition;
  draftLoaded: boolean;
  mode: 'demo' | 'production';
  respondentPlaceState: RespondentPlaceState;
  resolvedIssuer: ResolvedIssuer;
  submitState: SubmitState;
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

      {submitState.status === 'confirmed' ? (
        <ConfirmationPanel confirmation={submitState.confirmation} />
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

  const { snapshot, submissionStatuses } = state;
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

function ObligationItem({ obligation }: { obligation: RespondentObligation }) {
  return (
    <li className="place-list__item">
      <div className="place-list__row">
        <strong>{obligation.title}</strong>
        <span className={`place-pill place-pill--${slugToken(obligation.state)}`}>
          {labelFromToken(obligation.state)}
        </span>
      </div>
      <p>{obligation.issuer.name}</p>
      {obligation.dueAt ? <small>Due {formatDate(obligation.dueAt)}</small> : null}
    </li>
  );
}

function DocumentItem({ document }: { document: RespondentDocumentRecord }) {
  return (
    <li className="place-list__item">
      <div className="place-list__row">
        <strong>{document.displayName}</strong>
        <span className="place-pill">{labelFromToken(document.kind)}</span>
      </div>
      <p>{document.issuer?.name ?? document.contentRef.mediaType}</p>
      <small>
        Uploaded {formatDate(document.capturedAt)}
        {document.expiresAt ? ` / Expires ${formatDate(document.expiresAt)}` : ''}
      </small>
    </li>
  );
}

function SubmissionItem({
  status,
  submission,
}: {
  status: ApplicantStatusResource | undefined;
  submission: RespondentSubmissionRecord;
}) {
  const feedback = statusFeedback(status, submission);
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
  return (
    <section className="auth-required" aria-labelledby="auth-required-title">
      <p className="respondent-header__kicker">Sign in required</p>
      <h1 id="auth-required-title">Sign in to continue</h1>
      <p>This form requires a verified sign-in before it can be loaded.</p>
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

function idpOptionLabel(option: IdpOption): string {
  if (option.kind === 'oidc') {
    return option.displayName;
  }
  if (option.kind === 'magic-link') {
    return option.channel === 'sms' ? 'SMS link' : 'email link';
  }
  return 'anonymous access';
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
  return null;
}

function ConfirmationPanel({ confirmation }: { confirmation: SubmitConfirmation }) {
  return (
    <section className="confirmation-panel" aria-labelledby="confirmation-title" tabIndex={-1}>
      <h2 id="confirmation-title">Submission received</h2>
      <p>Reference number</p>
      <strong>{confirmation.referenceNumber}</strong>
      {confirmation.trackingUri ? (
        <a href={confirmation.trackingUri}>Track this submission</a>
      ) : null}
    </section>
  );
}

function RuntimePolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <div className="shell__status shell__status--error" role="alert">
      <h1>This form cannot be loaded.</h1>
      <p>
        This form requires a capability this site does not currently support.
        Try again later, or contact the sender for help.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </div>
  );
}

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
): { label: string; detail: string } {
  if (!status) {
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

function labelFromToken(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

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
