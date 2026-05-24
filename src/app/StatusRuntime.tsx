import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type { StatusRouteParams } from './status-route.ts';

interface StatusRuntimeProps {
  composition: Composition;
  config: FormspecWebConfig;
  route: StatusRouteParams;
}

export function StatusRuntime(_props: StatusRuntimeProps) {
  return (
    <section className="status-surface" aria-labelledby="status-title">
      <h1 id="status-title">Your application status</h1>
      <p>Loading status</p>
    </section>
  );
}
