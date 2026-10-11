import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useBrowserLocation } from '@formspec-org/surface-react';
import { createScreenerLocaleResolver } from '@formspec-org/engine/render';
import { UI_STRINGS, type ChromeStringKey } from '@formspec-org/layout';
import { targetDefinitionMatches } from '@formspec-org/types';
import { localeOptionsForDefinition } from '../demo/locales.ts';
import type { IdentityBinding } from '../composition/default.ts';
import type { Composition } from '../composition/types.ts';
import type { NativePackageBoot } from '../composition/native-package.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type { IdpOption } from '../ports/identity-provider.ts';
import { AuthRequiredSurface, ConfirmationPanel } from './RespondentRuntime.tsx';
import { isIdentityInteractionStarted } from './respondent-flow.ts';
import { clearNativeSignInReturn, rememberNativeSignInReturn, clearNativeSignOutReturn, rememberNativeSignOutReturn } from './auth-callback.ts';
import { nativeAdmissionDiagnostic } from '../composition/native-package-admission-error.ts';
import { NativePackageRespondentHost } from './NativePackageRespondentHost.tsx';
import { chooseComposition } from './main-helpers.ts';
import { SessionStatus } from './SessionStatus.tsx';

/** Keep the package owner alive across its authored Surface routes. */
export function NativePackageRoot({ config, identityBindingFactory }: { config: FormspecWebConfig; identityBindingFactory?: () => IdentityBinding }) {
  const [selectionQuery, setSelectionQuery] = useState(() => window.location.search);
  useEffect(() => {
    const changed = () => setSelectionQuery(window.location.search);
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  const selected = useMemo(() => {
    try {
      // Package selection stays in the public query while the Surface owns the path.
      const selection = new URL(window.location.href);
      selection.pathname = '/';
      selection.search = selectionQuery;
      selection.hash = '';
      return { composition: chooseComposition({ href: selection.href, config, identityBindingFactory }) };
    } catch { return { composition: undefined }; }
  }, [config, selectionQuery, identityBindingFactory]);
  return selected.composition
    ? <NativePackageRuntime composition={selected.composition} config={config} />
    : <NativePackageStatus failed />;
}

export function NativePackageRuntime({ composition, config }: { composition: Composition; config: FormspecWebConfig }) {
  const required = !!composition.browserAuthSession
    && (config.identity.mode === 'oidc-required' || config.ports.identityProvider === 'oidc');
  return required
    ? <NativePackageSignIn key={config.identity.oidc?.issuer} composition={composition} config={config} />
    : <AdmittedNativePackageRuntime composition={composition} config={config} />;
}

/** Explicit sign-in uses the composition's selected provider; boot owns recovery afterwards. */
function NativePackageSignIn({ composition, config }: { composition: Composition; config: FormspecWebConfig }) {
  const [state, setState] = useState<{ owner?: Composition; ready?: boolean; options?: IdpOption[]; authenticating?: boolean; error?: unknown }>({});
  const attempt = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => {
    const generation = ++lifetime.current;
    attempt.current = false;
    setState({ owner: composition });
    void (async () => {
      const session = await composition.browserAuthSession!.getSession();
      if (lifetime.current !== generation) return;
      if (session) { setState({ owner: composition, ready: true }); return; }
      const choices = await composition.identityProvider.discover(config.identity.oidc?.minAssurance);
      if (lifetime.current !== generation) return;
      const options = choices.filter(option => option.kind === 'oidc' && option.issuer === config.identity.oidc?.issuer);
      if (!options.length) throw new Error('The configured sign-in option is unavailable.');
      setState({ owner: composition, options });
    })().catch(error => { if (lifetime.current === generation) setState({ owner: composition, options: [], error }); });
    return () => { ++lifetime.current; };
  }, [composition, config]);
  async function signIn(option: IdpOption) {
    if (attempt.current) return;
    attempt.current = true;
    const generation = lifetime.current;
    const href = window.location.href;
    let retained = false;
    setState(current => ({ ...current, authenticating: true, error: undefined }));
    try {
      retained = rememberNativeSignInReturn(href, config);
      await composition.identityProvider.authenticate(option);
      if (lifetime.current !== generation) return;
      if (!await composition.browserAuthSession!.getSession()) throw new Error('Sign-in could not be confirmed.');
      if (lifetime.current !== generation) return;
      if (retained) clearNativeSignInReturn(href, config);
      if (lifetime.current === generation) setState({ owner: composition, ready: true });
    } catch (error) {
      if (lifetime.current !== generation || isIdentityInteractionStarted(error)) return;
      attempt.current = false;
      if (retained) { try { clearNativeSignInReturn(href, config); } catch { /* Retained navigation grants no access. */ } }
      setState(current => ({ ...current, authenticating: false, error }));
    }
  }
  if (state.owner !== composition || !state.options && !state.ready) return <NativePackageStatus />;
  if (state.ready) return <AdmittedNativePackageRuntime composition={composition} config={config} />;
  return <main className="fs-surface-admission native-package-status">
    <AuthRequiredSurface options={state.options ?? []} reason="initial-sign-in" authenticating={!!state.authenticating}
      error={state.error} onSignIn={option => void signIn(option)} />
  </main>;
}

function admittedNativeNavigationPath(href: string): string {
  const next = new URL(href, window.location.href);
  if (next.origin !== window.location.origin || next.search || next.hash) {
    throw new Error('Native package navigation requires an admitted local route');
  }
  return next.pathname;
}

function AdmittedNativePackageRuntime({ composition, config }: { composition: Composition; config: FormspecWebConfig }) {
  const [state, setState] = useState<{ owner?: Composition; boot?: NativePackageBoot; outcome?: Awaited<ReturnType<NonNullable<NativePackageBoot['resumeSubmitted']>>>; failed?: boolean; identityChanged?: boolean; failureStage?: string }>({});
  const lifetime = useMemo(() => ({ generation: 0 }), [composition]);
  const [location, navigate] = useBrowserLocation(window.location.pathname);
  const selection = useMemo(() => window.location.search, [composition]);
  const onNavigate = useCallback((href: string) => {
    const pathname = admittedNativeNavigationPath(href);
    navigate(pathname);
    window.history.replaceState(window.history.state, '', `${pathname}${selection}`);
  }, [navigate, selection]);
  const resolveNavigationHref = useCallback((href: string) => `${admittedNativeNavigationPath(href)}${selection}`, [selection]);

  useEffect(() => {
    const generation = ++lifetime.generation;
    let active = true;
    let boot: NativePackageBoot | undefined;
    let releaseIdentity: (() => void) | undefined;
    setState({ owner: composition });
    const loading = composition.nativePackageRespondent?.load();
    if (!loading) setState({ owner: composition, failed: true });
    void loading?.then(async value => {
      boot = value;
      const session = value.composition.browserAuthSession;
      if (session && active) {
        let accepted: string | undefined;
        releaseIdentity = session.subscribe(next => {
          const identity = next ? JSON.stringify([next.issuer, next.subject, next.revision]) : undefined;
          if (accepted && identity !== accepted) {
            value.host.dispose();
            if (active) setState({ owner: composition, failed: true, identityChanged: true });
            active = false;
            releaseIdentity?.();
          } else if (identity) accepted = identity;
        });
      }
      const outcome = await value.resumeSubmitted?.();
      if (active) setState({ owner: composition, boot: value, outcome });
      else if (lifetime.generation === generation) value.host.dispose();
    }).catch(error => {
      if (lifetime.generation === generation) boot?.host.dispose();
      if (active) {
        const diagnostic = nativeAdmissionDiagnostic(error);
        console.warn('Native form admission failed', JSON.stringify(diagnostic));
        setState({ owner: composition, failed: true, failureStage: diagnostic.stage });
      }
    });
    return () => {
      active = false;
      releaseIdentity?.();
      queueMicrotask(() => {
        if (lifetime.generation === generation) boot?.host.dispose();
      });
    };
  }, [composition, lifetime]);

  if (state.owner !== composition || !state.boot) return <NativePackageStatus failed={state.owner === composition && state.failed} identityChanged={state.identityChanged}>
    {state.owner === composition && state.failed && state.failureStage === 'identity'
      && composition.browserAuthSession && config.identity.oidc?.postLogoutRedirectUri
      ? <NativePackageIdentityRecovery composition={composition} config={config} /> : null}
  </NativePackageStatus>;
  const boot = state.boot;
  return <NativePackageFrame boot={boot} selection={selection} location={location} outcome={state.outcome} onNavigate={onNavigate}>
    {screenerLocale => <NativePackageRespondentHost screenerCompletion={boot.screenerCompletion} screenerLocale={screenerLocale} host={boot.host} composition={boot.composition}
    config={config} componentDocument={boot.componentDocument} localeDocuments={boot.localeDocuments}
    componentRouteResolver={boot.componentRouteResolver}
    location={location} onNavigate={onNavigate} resolveNavigationHref={resolveNavigationHref} />}
  </NativePackageFrame>;
}

function NativePackageIdentityRecovery({ composition, config }: { composition: Composition; config: FormspecWebConfig }) {
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle');
  const pending = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => { ++lifetime.current; return () => { ++lifetime.current; }; }, [composition, config]);
  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    const generation = lifetime.current;
    const href = window.location.href;
    let retained = false;
    setState('pending');
    try {
      retained = rememberNativeSignOutReturn(href, config);
      await composition.browserAuthSession!.logout();
    } catch {
      if (lifetime.current !== generation) return;
      if (retained) { try { clearNativeSignOutReturn(href, config); } catch { /* Navigation grants no access. */ } }
      pending.current = false;
      setState('failed');
    }
  }
  return <>
    <p>Your sign-in could not be confirmed for this form. Sign out to try again with a fresh session.</p>
    <button type="button" className="locale-button" disabled={state === 'pending'} onClick={() => void signOut()}>
      {state === 'pending' ? 'Opening sign-out' : 'Sign out and try again'}
    </button>
    {state === 'failed' ? <p role="alert">Sign-out could not be confirmed. Try again.</p> : null}
  </>;
}

function NativePackageStatus({ failed, identityChanged, children }: { failed?: boolean; identityChanged?: boolean; children?: React.ReactNode }) {
  return <main className="fs-surface-admission native-package-status" role={failed ? 'alert' : 'status'}>
    <h1>{identityChanged ? 'Your sign-in session changed' : failed ? 'This form cannot be loaded.' : 'Preparing this form'}</h1>
    {identityChanged ? <a className="locale-button" href={`/${window.location.search}`}>Return to form</a> : null}
    {failed && !identityChanged && !children ? <p>Use the form link provided by its publisher.</p> : null}
    {children}
  </main>;
}

/** Recovery controls use the qualified Locale and the host's scoped authority. */
function NativePackageFrame({ boot, selection, location, outcome, onNavigate, children }: { onNavigate: (href: string) => void; boot: NativePackageBoot; selection: string; location: string; outcome?: Awaited<ReturnType<NonNullable<NativePackageBoot['resumeSubmitted']>>>; children: (screenerLocale?: string) => React.ReactNode }) {
  const state = useSyncExternalStore(boot.host.subscribe, boot.host.getSnapshot, boot.host.getSnapshot);
  const [operation, setOperation] = useState<'idle' | 'locale' | 'clearing' | 'cleared' | 'clear-error' | 'locale-error' | 'refreshing' | 'refresh-error'>('idle');
  const heading = useRef<HTMLHeadingElement>(null);
  const operationPending = useRef(false);
  const matchingLocales = boot.localeDocuments.filter(document => document.locale.toLowerCase() === state.locale.toLowerCase()
    && document.target.kind === 'definition' && targetDefinitionMatches(document.target, boot.host.definition));
  const locale = matchingLocales.length === 1 ? matchingLocales[0] : undefined;
  const text = (key: ChromeStringKey) => locale?.strings[`$ui.${key}`] ?? UI_STRINGS[key];
  const applicationText = (property: string) => locale?.strings[`$module.${boot.host.moduleId}.application.${property}`];
  const checkpoint = state.checkpointState ?? 'unsaved';
  const checkpointSuffix = { unsaved: 'Unsaved', saving: 'Saving', saved: 'Saved', failed: 'Failed' }[checkpoint];
  const definitionOptions = localeOptionsForDefinition(boot.host.definition, boot.localeDocuments);
  const confirmation = state.submitted ?? (state.controller?.phase === 'submitted'
    && state.controller.confirmation?.recordKind === 'response' ? state.controller.confirmation : undefined);
  let startupRoute: ReturnType<typeof boot.host.getStartupRoute> | undefined;
  let routeFailed = false;
  try { startupRoute = boot.host.getStartupRoute(location); } catch { routeFailed = true; }
  // A fresh route/session lease owns presentation only, independently of draft restoration.
  const screenerLease = useMemo(() => {
    let documents: ReturnType<typeof boot.host.getStartupRoute>['screenerDocuments'];
    try { documents = boot.host.getStartupRoute(location).screenerDocuments; } catch { return undefined; }
    if (!documents?.length) return undefined;
    const admitted = documents.every(document => createScreenerLocaleResolver({ document,
      localeDocuments: boot.localeDocuments, chromeKeys: Object.keys(UI_STRINGS) }).status === 'ready');
    const codes = admitted ? [...new Set(boot.localeDocuments.filter(locale => locale.target.kind === 'screener'
      && locale.target.url === documents[0].url).map(locale => locale.locale.toLowerCase()))]
      .filter(code => documents.every(document => boot.localeDocuments.some(locale => locale.target.kind === 'screener'
        && locale.target.url === document.url && locale.locale.toLowerCase() === code))) : [];
    return { options: codes.map(code => {
      let label = code.toUpperCase();
      try { label = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? label; } catch { /* Use the admitted code. */ }
      return { code, label };
    }), initial: codes.includes(boot.initialLocale.toLowerCase()) ? boot.initialLocale.toLowerCase() : codes[0] };
  }, [boot, location, state.sessionGeneration]);
  const activeLease = useRef(screenerLease); activeLease.current = screenerLease;
  const [presentation, setPresentation] = useState<{ lease: typeof screenerLease; code: string }>();
  const screenerLocale = presentation?.lease === screenerLease ? presentation?.code : screenerLease?.initial;
  const options = screenerLease?.options ?? definitionOptions;
  // Keep the owned native preparation or signature mounted while it qualifies current sources.
  const ownedNativeSigningState = state.nativeReadiness !== undefined && state.controller?.owned === true && !!(state.controller.prepared || state.controller.signed);
  const startupBlocked = !confirmation && !state.cleared && outcome !== 'submitted'
    && (!!startupRoute?.requiresScreener || !!startupRoute?.requiresHostState && !state.runtime && !ownedNativeSigningState);
  const preparing = startupBlocked && !startupRoute?.requiresScreener && (!!state.controller?.prepared || state.controller?.phase === 'prepare');
  const formTitle = locale?.strings['$form.title'] ?? state.formTitle;
  const entryLabel = startupRoute?.entryTitle ?? formTitle;
  const localeLocked = !!confirmation || !!state.controller?.signed || !!state.controller?.confirmation
    || state.controller?.phase === 'sign' || state.controller?.phase === 'submit';
  useEffect(() => { if (operation === 'cleared' || startupBlocked && !preparing) heading.current?.focus(); }, [operation, startupBlocked, preparing]);
  async function changeLocale(code: string) {
    if (operationPending.current || state.cleared) return;
    if (screenerLease) {
      if (activeLease.current !== screenerLease || !screenerLease.options.some(option => option.code === code)) return;
      setPresentation({ lease: screenerLease, code }); return;
    }
    operationPending.current = true; setOperation('locale');
    try { await boot.host.selectLocale(code); setOperation('idle'); }
    catch { setOperation('locale-error'); }
    finally { operationPending.current = false; }
  }
  async function refreshApplication() {
    if (operationPending.current || !boot.host.refreshApplication) return;
    operationPending.current = true; setOperation('refreshing');
    try { await boot.host.refreshApplication(); setOperation('idle'); }
    catch { setOperation('refresh-error'); }
    finally { operationPending.current = false; }
  }
  async function clear() {
    if (operationPending.current) return;
    operationPending.current = true; setOperation('clearing');
    try { await boot.host.clearDraftAccess(); setOperation('cleared'); }
    catch { setOperation('clear-error'); }
    finally { operationPending.current = false; }
  }
  if (routeFailed && !confirmation && operation !== 'cleared') return <NativePackageStatus failed />;
  return <div className="native-package-workspace">
    <div className="respondent-toolbar">
      <div className="respondent-toolbar__group" role="group" aria-label={text('form.language')}>
        {options.map(option => <button type="button" className="locale-button" key={option.code}
          disabled={(!screenerLease && (!state.controller || localeLocked)) || state.cleared || operation === 'locale' || operation === 'clearing'}
          aria-pressed={(screenerLease ? screenerLocale : state.locale)?.toLowerCase() === option.code.toLowerCase()} onClick={() => void changeLocale(option.code)}>{option.label}</button>)}
      </div>
      {(!confirmation && state.controller || operation === 'clear-error') && operation !== 'cleared' ? <button type="button" className="locale-button"
        disabled={operation === 'locale' || operation === 'clearing' || operation === 'refreshing'} onClick={() => void clear()}>
        {text(operation === 'clearing' ? 'receipt.clearing' : 'receipt.clear')}
      </button> : null}
    </div>
    {!confirmation && !state.cleared && operation === 'idle' && state.runtime && (state.controller?.signed || state.controller?.pendingSign)
      && ['prepared', 'signed', 'refused', 'failed'].includes(state.controller.phase)
      && startupRoute?.signedReviewHref ? <button type="button" className="locale-button"
        onClick={() => onNavigate(startupRoute.signedReviewHref!)}>
        {state.controller?.pendingSign ? 'Review previous signing attempt' : locale?.strings[`$module.${boot.host.moduleId}.response.reviewSigned`] ?? startupRoute.signedReviewTitle ?? 'Review signed response'}
      </button> : null}
    {boot.host.applicationCapabilities && !state.cleared && operation !== 'cleared'
      && (state.applicationLookup || state.application || !confirmation && state.editableSessionActive) ? <SessionStatus>
      {state.applicationLookup ? <p role="status">{applicationText('statusUnavailable')
        ?? 'Application status is unavailable. Saved progress remains available; Start and Submit are unavailable until status can be checked.'}</p> : null}
      {state.application ? <>
        <p role="status">{applicationText(state.application.status === 'submitted' ? 'submitted' : 'inProgress')
          ?? (state.application.status === 'submitted' ? 'Application submitted' : 'Application in progress')}: {state.application.caseReference}</p>
      </> : null}
      {state.application || state.applicationLookup ? <button type="button" className="locale-button" disabled={operation === 'refreshing' || operation === 'clearing'
          || !!state.controller && !['idle', 'saved', 'prepared', 'signed', 'submitted', 'refused', 'failed'].includes(state.controller.phase)}
          onClick={() => void refreshApplication()}>{applicationText('refresh') ?? 'Refresh application status'}</button> : null}
      {!confirmation && state.editableSessionActive ? <p role="status">{boot.host.applicationCapabilities.persistentSaving
        ? applicationText(`checkpoint${checkpointSuffix}`)
          ?? ({ unsaved: 'Changes have not been saved', saving: 'Saving progress', saved: 'Progress saved', failed: 'Progress could not be saved. Try again.' })[checkpoint]
         : applicationText(`staging${checkpointSuffix}`)
          ?? ({ unsaved: 'Signing copy has not been prepared', saving: 'Preparing signing copy', saved: 'Signing copy prepared', failed: 'Signing copy could not be prepared. Try again.' })[checkpoint]}</p> : null}
      {!confirmation && state.editableSessionActive && !boot.host.applicationCapabilities.persistentSaving ? <p>{applicationText('saveUnavailable')
        ?? 'Save for later is unavailable. Prepare a signing copy when you are ready.'}</p> : null}
    </SessionStatus> : null}
    {operation === 'refresh-error' ? <SessionStatus><p role="alert">{applicationText('refreshFailed') ?? 'Application status could not be confirmed. Try again.'}</p></SessionStatus> : null}
    {operation === 'clear-error' ? <SessionStatus><p role="alert">{text('draft.startCurrentFailed')}</p></SessionStatus> : null}
    {operation === 'locale-error' ? <SessionStatus><p role="alert">{text('form.languageSaveFailed')}</p></SessionStatus> : null}
    {operation === 'cleared' ? <main className="shell__status">
      <h1 tabIndex={-1} ref={heading}>{text('receipt.clearedTitle')}</h1>
      <p>{text('receipt.clearedDetail')}</p>
      {startupRoute ? <a className="locale-button" href={`${startupRoute.entryHref}${selection}`}>{entryLabel}</a> : null}
    </main> : state.cleared ? null : confirmation ? <main className="shell__status">
      <ConfirmationPanel confirmation={confirmation} resolveChromeText={text} pendingFilingAndSigning={false}
        focusOnMount onClearTerminal={clear} terminalClearState={{ status: operation === 'clearing' ? 'clearing' : 'idle' }} />
    </main> : startupBlocked ? <main className="shell__status" role="status" aria-busy={preparing}>
      <h1 ref={heading} tabIndex={-1}>{formTitle}</h1>
      {!preparing ? <a className="locale-button" href={`${startupRoute!.entryHref}${selection}`}>{entryLabel}</a> : null}
    </main> : children(screenerLocale)}
  </div>;
}
