import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useBrowserLocation } from '@formspec-org/surface-react';
import { UI_STRINGS, type ChromeStringKey } from '@formspec-org/layout';
import { localeOptionsForDefinition } from '../demo/locales.ts';
import type { Composition } from '../composition/types.ts';
import type { NativePackageBoot } from '../composition/native-package.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { ConfirmationPanel } from './RespondentRuntime.tsx';
import { NativePackageRespondentHost } from './NativePackageRespondentHost.tsx';
import { chooseComposition } from './main-helpers.ts';

/** Keep the package owner alive across its authored Surface routes. */
export function NativePackageRoot({ config }: { config: FormspecWebConfig }) {
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
      return { composition: chooseComposition({ href: selection.href, config }) };
    } catch { return { composition: undefined }; }
  }, [config, selectionQuery]);
  return selected.composition
    ? <NativePackageRuntime composition={selected.composition} config={config} />
    : <NativePackageStatus failed />;
}

export function NativePackageRuntime({ composition, config }: { composition: Composition; config: FormspecWebConfig }) {
  const [state, setState] = useState<{ owner?: Composition; boot?: NativePackageBoot; outcome?: Awaited<ReturnType<NonNullable<NativePackageBoot['resumeSubmitted']>>>; failed?: boolean }>({});
  const lifetime = useMemo(() => ({ generation: 0 }), [composition]);
  const [location, navigate] = useBrowserLocation(window.location.pathname);
  const selection = useMemo(() => window.location.search, [composition]);
  const onNavigate = useCallback((href: string) => {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin || next.search || next.hash) {
      throw new Error('Native package navigation requires an admitted local route');
    }
    navigate(next.pathname);
    window.history.replaceState(window.history.state, '', `${next.pathname}${selection}`);
  }, [navigate, selection]);

  useEffect(() => {
    const generation = ++lifetime.generation;
    let active = true;
    let boot: NativePackageBoot | undefined;
    setState({ owner: composition });
    const loading = composition.nativePackageRespondent?.load();
    if (!loading) setState({ owner: composition, failed: true });
    void loading?.then(async value => {
      boot = value;
      const outcome = await value.resumeSubmitted?.();
      if (active) setState({ owner: composition, boot: value, outcome });
      else if (lifetime.generation === generation) value.host.dispose();
    }).catch(() => { if (lifetime.generation === generation) boot?.host.dispose(); if (active) setState({ owner: composition, failed: true }); });
    return () => {
      active = false;
      queueMicrotask(() => {
        if (lifetime.generation === generation) boot?.host.dispose();
      });
    };
  }, [composition, lifetime]);

  if (state.owner !== composition || !state.boot) return <NativePackageStatus failed={state.owner === composition && state.failed} />;
  return <NativePackageFrame boot={state.boot} selection={selection} location={location} outcome={state.outcome}>
    <NativePackageRespondentHost host={state.boot.host} composition={state.boot.composition}
    config={config} componentDocument={state.boot.componentDocument} localeDocuments={state.boot.localeDocuments}
    location={location} onNavigate={onNavigate} />
  </NativePackageFrame>;
}

function NativePackageStatus({ failed }: { failed?: boolean }) {
  return <main className="fs-surface-admission" role={failed ? 'alert' : 'status'}>
    <h1>{failed ? 'This form cannot be loaded.' : 'Preparing this form'}</h1>
    {failed ? <p>Use the form link provided by its publisher.</p> : null}
  </main>;
}

/** Recovery controls use the qualified Locale and the host's scoped authority. */
function NativePackageFrame({ boot, selection, location, outcome, children }: { boot: NativePackageBoot; selection: string; location: string; outcome?: Awaited<ReturnType<NonNullable<NativePackageBoot['resumeSubmitted']>>>; children: React.ReactNode }) {
  const state = useSyncExternalStore(boot.host.subscribe, boot.host.getSnapshot, boot.host.getSnapshot);
  const [operation, setOperation] = useState<'idle' | 'locale' | 'clearing' | 'cleared' | 'clear-error' | 'locale-error'>('idle');
  const heading = useRef<HTMLHeadingElement>(null);
  const operationPending = useRef(false);
  const locale = boot.localeDocuments.find(document => document.locale.toLowerCase() === state.locale.toLowerCase());
  const text = (key: ChromeStringKey) => locale?.strings[`$ui.${key}`] ?? UI_STRINGS[key];
  const definition = locale?.target.kind === 'definition' ? boot.host.bundle.definitions.get(locale.target.url) : undefined;
  const options = definition ? localeOptionsForDefinition(definition, boot.localeDocuments) : [];
  const confirmation = state.submitted ?? (state.controller?.phase === 'submitted'
    && state.controller.confirmation?.recordKind === 'response' ? state.controller.confirmation : undefined);
  let startupRoute: ReturnType<typeof boot.host.getStartupRoute> | undefined;
  let routeFailed = false;
  try { startupRoute = boot.host.getStartupRoute(location); } catch { routeFailed = true; }
  const startupBlocked = !confirmation && !state.cleared && outcome !== 'submitted'
    && !!startupRoute?.requiresHostState && !state.runtime;
  const preparing = startupBlocked && (!!state.controller?.prepared || state.controller?.phase === 'prepare');
  const formTitle = locale?.strings['$form.title'] ?? state.formTitle;
  const entryLabel = startupRoute?.entryTitle ?? formTitle;
  const localeLocked = !!confirmation || !!state.controller?.signed || !!state.controller?.confirmation
    || state.controller?.phase === 'sign' || state.controller?.phase === 'submit';
  useEffect(() => { if (operation === 'cleared' || startupBlocked && !preparing) heading.current?.focus(); }, [operation, startupBlocked, preparing]);
  async function changeLocale(code: string) {
    if (operationPending.current) return;
    operationPending.current = true; setOperation('locale');
    try { await boot.host.selectLocale(code); setOperation('idle'); }
    catch { setOperation('locale-error'); }
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
  return <>
    <div className="respondent-toolbar">
      <div className="respondent-toolbar__group" role="group" aria-label={text('form.language')}>
        {options.map(option => <button type="button" className="locale-button" key={option.code}
          disabled={!state.controller || localeLocked || state.cleared || operation === 'locale' || operation === 'clearing'}
          aria-pressed={state.locale.toLowerCase() === option.code.toLowerCase()} onClick={() => void changeLocale(option.code)}>{option.label}</button>)}
      </div>
      {(!confirmation && state.controller || operation === 'clear-error') && operation !== 'cleared' ? <button type="button" className="locale-button"
        disabled={operation === 'locale' || operation === 'clearing'} onClick={() => void clear()}>
        {text(operation === 'clearing' ? 'receipt.clearing' : 'receipt.clear')}
      </button> : null}
    </div>
    {operation === 'clear-error' ? <p role="alert">{text('draft.startCurrentFailed')}</p> : null}
    {operation === 'locale-error' ? <p role="alert">{text('form.languageSaveFailed')}</p> : null}
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
    </main> : children}
  </>;
}
