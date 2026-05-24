import { createDefaultComposition } from '../composition/default.ts';
import { createRouteNarrowedComposition } from '../composition/route-narrowing.ts';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { DOCUMENTS_ROUTE_NARROWING, parseDocumentsRoute } from './documents-route.ts';
import { OBLIGATIONS_ROUTE_NARROWING, parseObligationsRoute } from './obligations-route.ts';
import { STATUS_ROUTE_NARROWING, parseStatusRoute } from './status-route.ts';

/**
 * Picks the right composition factory based on the current route (FW-0068,
 * parameterized in FW-0070).
 *
 * Called from `main.tsx` at boot, before constructing the composition. Reuses
 * the pure `parseStatusRoute` / `parseObligationsRoute` / `parseDocumentsRoute`
 * parsers so the boot-time parse and the runtime parse in `App.tsx` cannot
 * disagree. Each narrowed route dispatches to `createRouteNarrowedComposition`
 * with its co-located descriptor; the full-app route falls back to
 * `createDefaultComposition`.
 *
 * Closes FW-0039 H-1 (FW-0068) and the N=4 sibling-factory parameterization
 * trigger (FW-0070). Adding a new narrowed route requires: (1) a new route
 * parser file, (2) a `*_ROUTE_NARROWING` descriptor co-located with it, and
 * (3) one new dispatch arm here.
 */
export function chooseComposition({
  href,
  config,
}: {
  href: string;
  config: FormspecWebConfig;
}): Composition {
  if (parseStatusRoute(href)) {
    return createRouteNarrowedComposition({ mode: 'default', config, route: STATUS_ROUTE_NARROWING });
  }
  if (parseObligationsRoute(href)) {
    return createRouteNarrowedComposition({
      mode: 'default',
      config,
      route: OBLIGATIONS_ROUTE_NARROWING,
    });
  }
  if (parseDocumentsRoute(href)) {
    return createRouteNarrowedComposition({
      mode: 'default',
      config,
      route: DOCUMENTS_ROUTE_NARROWING,
    });
  }
  return createDefaultComposition(config);
}
