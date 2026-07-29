import { lazy, Suspense, useMemo } from 'react';
import type { FormspecWebConfig } from '../../config/types.ts';
import { createRespondentSurfaceComposition } from './composition.ts';

const VerifiedRespondentSurface = lazy(async () => {
  const module = await import('./VerifiedRespondentSurface.tsx');
  return { default: module.VerifiedRespondentSurface };
});

export function SignedRespondentRoot({ config }: { config: FormspecWebConfig }) {
  const state = useMemo(() => {
    try {
      return {
        status: 'ready' as const,
        ...createRespondentSurfaceComposition(config),
      };
    } catch {
      return { status: 'unavailable' as const };
    }
  }, [config]);

  if (state.status === 'unavailable') {
    return (
      <main className="fs-surface-admission" role="alert">
        <h1>This signed app is not configured</h1>
        <p>
          This deployment did not provide every source, trust, release, and
          respondent boundary needed to open the signed app.
        </p>
      </main>
    );
  }

  return (
    <Suspense
      fallback={(
        <main className="fs-surface-admission" role="status">
          <h1>Preparing the signed app</h1>
          <p>The deployment is preparing its local verification controls.</p>
        </main>
      )}
    >
      <VerifiedRespondentSurface
        bundleConfig={state.bundleConfig}
        composition={state.composition}
        config={config}
      />
    </Suspense>
  );
}
