import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from 'react';
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
import type { SubmitConfirmation } from '../ports/submit-transport.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import { isProblemJson, type ProblemJson } from '../shared/problem-json.ts';
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
    }
  | { status: 'error'; error: unknown };

type ReadyRespondentState = Extract<RespondentState, { status: 'ready' }>;

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; error: unknown }
  | { status: 'confirmed'; confirmation: SubmitConfirmation };

export function RespondentRuntime({
  composition,
  config,
}: RespondentRuntimeProps) {
  const [respondentState, setRespondentState] = useState<RespondentState>({ status: 'loading' });
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    let engine: IFormEngine | undefined;
    let unsubscribe: (() => void) | undefined;
    let activeClaim: IdentityClaim | null = null;
    let reloadSequence = 0;
    setRespondentState({ status: 'loading' });
    setSubmitState({ status: 'idle' });

    const applyReadyState = async (claim: IdentityClaim | null): Promise<void> => {
      const sequence = ++reloadSequence;
      setRespondentState({ status: 'loading' });
      setSubmitState({ status: 'idle' });
      try {
        await engineReady;
        const readyState = await createReadyState(composition, config, claim);

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
    };
  }, [composition]);

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
          resolvedIssuer={respondentState.resolvedIssuer}
          submitState={submitState}
          onLocaleChange={handleLocaleChange}
        />
      </FormspecProvider>
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
): Promise<ReadyRespondentState> {
  assertIdentityPolicySatisfied({
    claim,
    identityMode: config.identity.mode,
    runtimeMode: composition.mode,
  });
  const definition = await composition.definitionSource.getDefinition(
    composition.initialDefinitionUrl,
  );
  const draftKey: DraftKey = {
    formUrl: definition.url,
    formVersion: definition.version,
    subjectRef: claim?.subjectRef,
  };
  const draft = await composition.draftStore.load(draftKey);
  const activeLocale = defaultLocaleForDefinition(definition);

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
  };
}

function RespondentSurface({
  activeLocale,
  brandName,
  definition,
  draftLoaded,
  mode,
  resolvedIssuer,
  submitState,
  onLocaleChange,
}: {
  activeLocale: string;
  brandName: string;
  definition: FormDefinition;
  draftLoaded: boolean;
  mode: 'demo' | 'production';
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
