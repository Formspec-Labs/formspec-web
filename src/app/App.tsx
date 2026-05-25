import { useEffect, useLayoutEffect, useState, type ComponentType } from 'react';
import type { FormspecWebConfig } from '../config/types.ts';
import { demoSampleForm } from '../demo/index.ts';
import type { Composition } from '../composition/types.ts';
import { useComposition } from './hooks/useComposition.ts';
import { parseStatusRoute, type StatusRouteParams } from './status-route.ts';
import { parseObligationsRoute, type ObligationsRouteParams } from './obligations-route.ts';
import { parseDocumentsRoute, type DocumentsRouteParams } from './documents-route.ts';
import { parseHistoryRoute, type HistoryRouteParams } from './history-route.ts';
import { parseScreenerRoute, type ScreenerRouteParams } from './screener-route.ts';

interface AppProps {
  config: FormspecWebConfig;
}

interface RespondentRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
}

interface StatusRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: StatusRouteParams;
}

interface ObligationsRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: ObligationsRouteParams;
}

interface DocumentsRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: DocumentsRouteParams;
}

interface HistoryRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: HistoryRouteParams;
}

interface ScreenerRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: ScreenerRouteParams;
}

type RuntimeState =
  | { status: 'loading' }
  | {
      status: 'ready';
      route: 'form';
      Runtime: ComponentType<RespondentRuntimeProps>;
    }
  | {
      status: 'ready';
      route: 'status';
      Runtime: ComponentType<StatusRuntimeProps>;
      params: StatusRouteParams;
    }
  | {
      status: 'ready';
      route: 'obligations';
      Runtime: ComponentType<ObligationsRuntimeProps>;
      params: ObligationsRouteParams;
    }
  | {
      status: 'ready';
      route: 'documents';
      Runtime: ComponentType<DocumentsRuntimeProps>;
      params: DocumentsRouteParams;
    }
  | {
      status: 'ready';
      route: 'history';
      Runtime: ComponentType<HistoryRuntimeProps>;
      params: HistoryRouteParams;
    }
  | {
      status: 'ready';
      route: 'screener';
      Runtime: ComponentType<ScreenerRuntimeProps>;
      params: ScreenerRouteParams;
    }
  | { status: 'error'; error: unknown };

export function App({ config }: AppProps) {
  const composition = useComposition();
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ status: 'loading' });

  useLayoutEffect(() => {
    document.getElementById('formspec-static-shell')?.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRuntimeState({ status: 'loading' });
    const statusParams = parseStatusRoute(window.location.href);
    const obligationsParams = statusParams ? null : parseObligationsRoute(window.location.href);
    const documentsParams =
      statusParams || obligationsParams ? null : parseDocumentsRoute(window.location.href);
    const historyParams =
      statusParams || obligationsParams || documentsParams
        ? null
        : parseHistoryRoute(window.location.href);
    const screenerParams =
      statusParams || obligationsParams || documentsParams || historyParams
        ? null
        : parseScreenerRoute(window.location.href);
    const loader = statusParams
      ? import('./StatusRuntime.tsx').then((module) => ({
          status: 'ready' as const,
          route: 'status' as const,
          Runtime: module.StatusRuntime,
          params: statusParams,
        }))
      : obligationsParams
        ? import('./ObligationsRuntime.tsx').then((module) => ({
            status: 'ready' as const,
            route: 'obligations' as const,
            Runtime: module.ObligationsRuntime,
            params: obligationsParams,
          }))
        : documentsParams
          ? import('./DocumentsRuntime.tsx').then((module) => ({
              status: 'ready' as const,
              route: 'documents' as const,
              Runtime: module.DocumentsRuntime,
              params: documentsParams,
            }))
          : historyParams
            ? import('./HistoryRuntime.tsx').then((module) => ({
                status: 'ready' as const,
                route: 'history' as const,
                Runtime: module.HistoryRuntime,
                params: historyParams,
              }))
            : screenerParams
              ? import('./ScreenerRuntime.tsx').then((module) => ({
                  status: 'ready' as const,
                  route: 'screener' as const,
                  Runtime: module.ScreenerRuntime,
                  params: screenerParams,
                }))
              : import('./RespondentRuntime.tsx').then((module) => ({
                  status: 'ready' as const,
                  route: 'form' as const,
                  Runtime: module.RespondentRuntime,
                }));
    void loader
      .then((next) => {
        if (!cancelled) {
          setRuntimeState(next);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRuntimeState({ status: 'error', error });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [composition]);

  const isBusy = runtimeState.status === 'loading';

  return (
    <main className="shell" aria-busy={isBusy}>
      <div className="shell__inner">
        <section
          className="respondent-flow formspec-container"
          aria-labelledby="respondent-title"
          data-mode={composition.mode}
        >
          {runtimeState.status === 'ready' && runtimeState.route === 'form' ? (
            <runtimeState.Runtime composition={composition} config={config} />
          ) : runtimeState.status === 'ready' && runtimeState.route === 'status' ? (
            <runtimeState.Runtime composition={composition} config={config} route={runtimeState.params} />
          ) : runtimeState.status === 'ready' && runtimeState.route === 'obligations' ? (
            <runtimeState.Runtime composition={composition} config={config} route={runtimeState.params} />
          ) : runtimeState.status === 'ready' && runtimeState.route === 'documents' ? (
            <runtimeState.Runtime composition={composition} config={config} route={runtimeState.params} />
          ) : runtimeState.status === 'ready' && runtimeState.route === 'history' ? (
            <runtimeState.Runtime composition={composition} config={config} route={runtimeState.params} />
          ) : runtimeState.status === 'ready' && runtimeState.route === 'screener' ? (
            <runtimeState.Runtime composition={composition} config={config} route={runtimeState.params} />
          ) : (
            <>
              <ShellHeader mode={composition.mode} />
              {runtimeState.status === 'error' ? (
                <div className="submit-notice submit-notice--error" role="alert">
                  {runtimeMessage(runtimeState.error)}
                </div>
              ) : (
                <div className="submit-notice" role="status">
                  Loading form
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function ShellHeader({ mode }: { mode: 'demo' | 'production' }) {
  const title = mode === 'demo' ? demoSampleForm.title : 'Loading form';
  const description =
    mode === 'demo'
      ? demoSampleForm.description
      : 'Preparing the requested Formspec form.';
  return (
    <header className="respondent-header respondent-header--unbranded">
      <p className="respondent-header__kicker">Formspec Web</p>
      <h1 id="respondent-title">{title}</h1>
      {description ? <p data-formspec-shell-description>{description}</p> : null}
    </header>
  );
}

function runtimeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Try again. If the problem continues, contact support.';
}
