import { completeConfiguredAuthCallback } from './auth-callback.ts';
import { createConfiguredBrowserAuthSession, createOidcIdentityBinding, type IdentityBinding } from '../composition/oidc.ts';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import rootConfig from '../../formspec.config.ts';
import { readRuntimeConfig, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import '@formspec-org/layout/formspec-default.css';
import '../theme/upstream/adapters/tailwind-formspec-core.css';
import './app.css';
import { ConfigurationBootError } from './ConfigurationBootError.tsx';
import type { FormspecWebConfig } from '../config/types.ts';
import { respondentSurfaceDeploymentIsConfigured } from '../config/respondent-surface.ts';

const LegacyRoutedApp = lazy(() => import('./LegacyRoutedApp.tsx'));
const SignedRespondentRoot = lazy(async () => {
  const module = await import('../verifying-surface/respondent/SignedRespondentRoot.tsx');
  return { default: module.SignedRespondentRoot };
});
const NativePackageRoot = lazy(async () => {
  const module = await import('./NativePackageRuntime.tsx');
  return { default: module.NativePackageRoot };
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

try {
  mountApplication(resolveActiveConfig(rootConfig, readRuntimeConfig()), rootEl);
} catch {
  createRoot(rootEl).render(<ConfigurationBootError />);
}

function mountApplication(activeConfig: FormspecWebConfig, rootEl: HTMLElement) {
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
        <RoutedApp config={activeConfig} identityBindingFactory={identityBindingFactory} />
      </StrictMode>,
    );
  }).catch(() => {
    document.getElementById('formspec-static-shell')?.remove();
    const message = document.createElement('main');
    message.setAttribute('role', 'alert');
    message.textContent = 'Sign-in could not be completed. Return to the home page and try again.';
    rootEl.replaceChildren(message);
  });
}

function RoutedApp({ config, identityBindingFactory }: { config: FormspecWebConfig; identityBindingFactory?: () => IdentityBinding }) {
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
  // Keep the static shell visible while the selected form route loads.
  return (
    <Suspense fallback={null}>
      <LegacyRoutedApp config={config} identityBindingFactory={identityBindingFactory} />
    </Suspense>
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
