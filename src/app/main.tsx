import { completeConfiguredAuthCallback } from './auth-callback.ts';
import { createConfiguredBrowserAuthSession, createOidcIdentityBinding, type IdentityBinding } from '../composition/index.ts';
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
const NativePackageRoot = lazy(async () => {
  const module = await import('./NativePackageRuntime.tsx');
  return { default: module.NativePackageRoot };
});

const activeConfig = resolveActiveConfig(rootConfig, readRuntimeConfig());
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

const signedRespondentRootConfigured =
  respondentSurfaceDeploymentIsConfigured(activeConfig);
if (signedRespondentRootConfigured || activeConfig.referenceAdapters?.formspecStack?.nativePackageSigning) {
  document.getElementById('formspec-static-shell')?.remove();
} else {
  applyBrandTheme(document.documentElement, activeConfig.brand);
}

let sharedIdentityBinding: IdentityBinding | undefined;
const identityBindingFactory = activeConfig.ports.identityProvider === 'oidc'
  && activeConfig.referenceAdapters?.formspecStack?.formspecServerUrl
  ? () => {
      if (!activeConfig.identity.oidc) throw new Error('OIDC provider is not configured');
      if (!sharedIdentityBinding) {
        sharedIdentityBinding = createOidcIdentityBinding(activeConfig.identity.oidc);
        window.addEventListener('pagehide', (event) => {
          if (!event.persisted) sharedIdentityBinding?.browserAuthSession?.dispose();
        });
      }
      return sharedIdentityBinding;
    }
  : undefined;

// Complete callbacks once before React StrictMode or any route composition.
void completeConfiguredAuthCallback({
  href: window.location.href, config: activeConfig,
  createSession: createConfiguredBrowserAuthSession,
  navigate: (href) => window.location.replace(href),
}).then((handled) => {
  if (handled) return;
  createRoot(rootEl).render(
    <StrictMode>
      <RoutedApp config={activeConfig} />
    </StrictMode>,
  );
}).catch(() => {
  document.getElementById('formspec-static-shell')?.remove();
  const message = document.createElement('main');
  message.setAttribute('role', 'alert');
  message.textContent = 'Sign-in could not be completed. Return to the home page and try again.';
  rootEl.replaceChildren(message);
});

function RoutedApp({ config }: { config: FormspecWebConfig }) {
  if (config.referenceAdapters?.formspecStack?.nativePackageSigning) {
    return <Suspense fallback={<main className="fs-surface-admission" role="status"><h1>Preparing this form</h1></main>}><NativePackageRoot config={config} identityBindingFactory={identityBindingFactory} /></Suspense>;
  }
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
  const routeState = useRoutedComposition(config, identityBindingFactory);
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
