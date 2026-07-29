import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import rootConfig from '../../formspec.config.ts';
import { readRuntimeConfig, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import '@formspec-org/layout/formspec-default.css';
import '../theme/upstream/adapters/tailwind-formspec-core.css';
import { App } from './App.tsx';
import './app.css';
import { CompositionProvider } from './CompositionProvider.tsx';
import { formRouteErrorCopy, type FormRouteError } from './form-route.ts';
import { useRoutedComposition } from './routed-composition.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { respondentSurfaceDeploymentIsConfigured } from '../config/respondent-surface.ts';

const SignedRespondentRoot = lazy(async () => {
  const module = await import('../verifying-surface/respondent/SignedRespondentRoot.tsx');
  return { default: module.SignedRespondentRoot };
});

const activeConfig = resolveActiveConfig(rootConfig, readRuntimeConfig());
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

const signedRespondentRootConfigured =
  respondentSurfaceDeploymentIsConfigured(activeConfig);
if (signedRespondentRootConfigured) {
  document.getElementById('formspec-static-shell')?.remove();
} else {
  applyBrandTheme(document.documentElement, activeConfig.brand);
}

createRoot(rootEl).render(
  <StrictMode>
    <RoutedApp config={activeConfig} />
  </StrictMode>,
);

function RoutedApp({ config }: { config: FormspecWebConfig }) {
  if (respondentSurfaceDeploymentIsConfigured(config)) {
    return (
      <Suspense fallback={<SignedSurfaceBootPending />}>
        <SignedRespondentRoot config={config} />
      </Suspense>
    );
  }
  return <LegacyRoutedApp config={config} />;
}

function LegacyRoutedApp({ config }: { config: FormspecWebConfig }) {
  const routeState = useRoutedComposition(config);
  if (routeState.status === 'form-route-error') {
    return <FormRouteBootError error={routeState.error} />;
  }
  return (
    <CompositionProvider value={routeState.composition}>
      <App config={config} href={routeState.href} />
    </CompositionProvider>
  );
}

function SignedSurfaceBootPending() {
  return (
    <main className="fs-surface-admission" role="status">
      <h1>Preparing this signed app</h1>
      <p>This site is loading the checks needed before it can show the app.</p>
    </main>
  );
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
