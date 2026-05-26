import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import rootConfig from '../../formspec.config.ts';
import { readRuntimeConfig, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import '@formspec-org/layout/formspec-default.css';
import '../theme/upstream/adapters/tailwind-formspec-core.css';
import { App } from './App.tsx';
import './app.css';
import { CompositionProvider } from './CompositionProvider.tsx';
import { chooseComposition } from './main-helpers.ts';
import { formRouteErrorCopy, isFormRouteError, type FormRouteError } from './form-route.ts';

const activeConfig = resolveActiveConfig(rootConfig, readRuntimeConfig());
const bootState = bootComposition(window.location.href);
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

applyBrandTheme(document.documentElement, activeConfig.brand);

createRoot(rootEl).render(
  <StrictMode>
    {bootState.status === 'ready' ? (
      <CompositionProvider value={bootState.composition}>
        <App config={activeConfig} />
      </CompositionProvider>
    ) : (
      <FormRouteBootError error={bootState.error} />
    )}
  </StrictMode>,
);

function bootComposition(href: string):
  | { status: 'ready'; composition: ReturnType<typeof chooseComposition> }
  | { status: 'form-route-error'; error: FormRouteError } {
  try {
    return {
      status: 'ready',
      composition: chooseComposition({ href, config: activeConfig }),
    };
  } catch (error) {
    const routeError = formRouteError(error);
    if (routeError) {
      return { status: 'form-route-error', error: routeError };
    }
    throw error;
  }
}

function formRouteError(error: unknown): FormRouteError | null {
  return isFormRouteError(error) ? error : null;
}

function FormRouteBootError({ error }: { error: FormRouteError }) {
  return (
    <main className="shell" aria-busy={false}>
      <div className="shell__inner">
        <section
          className="respondent-flow formspec-container"
          aria-labelledby="respondent-title"
        >
          <div className="shell__status shell__status--error" role="alert">
            <h1 id="respondent-title">This form cannot be loaded.</h1>
            <p>{formRouteErrorCopy(error)}</p>
            <p className="support-code">Support reference: {error.code}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
