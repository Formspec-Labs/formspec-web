export { createDefaultComposition, buildRealIdentityProvider } from './default.ts';
export { createDemoComposition } from './demo.ts';
export { createStubComposition } from './stub.ts';
export {
  createRouteNarrowedComposition,
  type RouteNarrowing,
  type RouteNarrowingMode,
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
