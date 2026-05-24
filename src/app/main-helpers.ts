import {
  createDefaultComposition,
  createDefaultDocumentsRouteComposition,
  createDefaultObligationsRouteComposition,
  createDefaultStatusRouteComposition,
} from '../composition/default.ts';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { parseDocumentsRoute } from './documents-route.ts';
import { parseObligationsRoute } from './obligations-route.ts';
import { parseStatusRoute } from './status-route.ts';

/**
 * Picks the right composition factory based on the current route (FW-0068).
 *
 * Called from `main.tsx` at boot, before constructing the composition. Reuses
 * the pure `parseStatusRoute` / `parseObligationsRoute` / `parseDocumentsRoute`
 * parsers so the boot-time parse and the runtime parse in `App.tsx` cannot
 * disagree.
 *
 * Closes FW-0039 H-1: when the URL is `/status?case=urn:wos:...`, the
 * status-route factory wires only `statusReader` + the runtime-profile /
 * policy slots. No HTTP / OIDC / anonymous-session machinery boots.
 *
 * Extended for FW-0055 slice 1: when the URL is `/obligations`, the
 * obligations-route factory wires `respondentPlaceSource` + `identityProvider`
 * (gated on the respondent-place capability) + runtime-profile slots.
 *
 * Extended for FW-0056 slice 1: when the URL is `/documents`, the
 * documents-route factory wires the same respondent-place + identity + policy
 * slots; the surface is identity-bound by the same J-039/J-042 framing
 * logic.
 *
 * The N=4 dispatch arm (FW-0068's reviewer-named parameterization trigger)
 * is acknowledged in FW-0070 — internal refactor that collapses the four
 * sibling factories into one parameterized helper. Not landed here to keep
 * the FW-0056 row scope tight.
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
  if (parseDocumentsRoute(href)) {
    return createDefaultDocumentsRouteComposition(config);
  }
  return createDefaultComposition(config);
}
