import {
  createDefaultComposition,
  createDefaultObligationsRouteComposition,
  createDefaultStatusRouteComposition,
} from '../composition/default.ts';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { parseObligationsRoute } from './obligations-route.ts';
import { parseStatusRoute } from './status-route.ts';

/**
 * Picks the right composition factory based on the current route (FW-0068).
 *
 * Called from `main.tsx` at boot, before constructing the composition. Reuses
 * the pure `parseStatusRoute` / `parseObligationsRoute` parsers so the
 * boot-time parse and the runtime parse in `App.tsx` cannot disagree.
 *
 * Closes FW-0039 H-1: when the URL is `/status?case=urn:wos:...`, the
 * status-route factory wires only `statusReader` + the runtime-profile /
 * policy slots. No HTTP / OIDC / anonymous-session machinery boots.
 *
 * Extended for FW-0055 slice 1: when the URL is `/obligations`, the
 * obligations-route factory wires `respondentPlaceSource` + `identityProvider`
 * (real — the surface is identity-bound) + runtime-profile slots; form-shaped
 * MVP ports (definition / draft / submit) are noop.
 */
export function chooseComposition({
  href,
  config,
}: {
  href: string;
  config: FormspecWebConfig;
}): Composition {
  if (parseStatusRoute(href)) {
    return createDefaultStatusRouteComposition(config);
  }
  if (parseObligationsRoute(href)) {
    return createDefaultObligationsRouteComposition(config);
  }
  return createDefaultComposition(config);
}
