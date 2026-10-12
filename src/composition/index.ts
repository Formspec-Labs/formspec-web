export { createDefaultComposition, buildRealIdentityProvider, createOidcIdentityBinding, createConfiguredBrowserAuthSession, type IdentityBinding, type DefaultCompositionOptions } from './default.ts';
export {
  createRouteNarrowedComposition,
  type RouteNarrowing,
} from './route-narrowing.ts';
export {
  STATUS_ROUTE_NARROWING,
} from '../app/status-route.ts';
export {
  OBLIGATIONS_ROUTE_NARROWING,
} from '../app/obligations-route.ts';
export {
  DOCUMENTS_ROUTE_NARROWING,
} from '../app/documents-route.ts';
export type { Composition } from './types.ts';

export type { NativeInitialDataSourceFactory, NativeInitialDataSourcePorts } from '../shared/native-package-signing-host.ts';
export { createNativePackageComposition, type NativePackageCompositionOptions, type NativeScreenerCompositionPins, type NativeTaskCompositionPins } from './native-package.ts';

export { createUnavailableComposition } from './unavailable.ts';

export { createTaskComposition } from './task.ts';

export type { NativeHostEventCapability } from '../shared/native-host-events.ts';
