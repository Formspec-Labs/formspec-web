import {
  createDefaultComposition,
  createDefaultStatusRouteComposition,
} from '../composition/default.ts';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { parseStatusRoute } from './status-route.ts';

/**
 * Picks the right composition factory based on the current route (FW-0068).
 *
 * Called from `main.tsx` at boot, before constructing the composition. Reuses
 * the pure `parseStatusRoute` so the boot-time parse and the runtime parse in
 * `App.tsx` cannot disagree.
 *
 * Closes FW-0039 H-1 — when the URL is `/status?case=urn:wos:...`, the
 * status-route factory wires only `statusReader` + the runtime-profile /
 * policy slots. No HTTP / OIDC / anonymous-session machinery boots.
 */
export function chooseComposition({
  href,
  config,
}: {
  href: string;
  config: FormspecWebConfig;
}): Composition {
  const statusRoute = parseStatusRoute(href);
  return statusRoute
    ? createDefaultStatusRouteComposition(config)
    : createDefaultComposition(config);
}
