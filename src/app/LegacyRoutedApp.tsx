import { useEffect } from 'react';
import type { IdentityBinding } from '../composition/oidc.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { App } from './App.tsx';
import { CompositionProvider } from './CompositionProvider.tsx';
import { ConfigurationBootError } from './ConfigurationBootError.tsx';
import { formRouteErrorCopy, type FormRouteError } from './form-route.ts';
import { useRoutedComposition } from './routed-composition.ts';

export default function LegacyRoutedApp({ config, identityBindingFactory }: { config: FormspecWebConfig; identityBindingFactory?: () => IdentityBinding }) {
  const routeState = useRoutedComposition(config, identityBindingFactory);
  if (routeState.status === 'configuration-error') return <ConfigurationBootError />;
  if (routeState.status === 'form-route-error') {
    return <FormRouteBootError error={routeState.error} />;
  }
  return (
    <CompositionProvider value={routeState.composition}>
      <App config={config} href={routeState.href} />
    </CompositionProvider>
  );
}

function FormRouteBootError({ error }: { error: FormRouteError }) {
  useEffect(() => { document.getElementById('formspec-static-shell')?.remove(); }, []);
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
