import {
  createStubComposition,
  createStubDocumentsRouteComposition,
  createStubObligationsRouteComposition,
  createStubStatusRouteComposition,
} from './stub.ts';
import type { Composition } from './types.ts';

export function createDemoComposition(): Composition {
  return createStubComposition();
}

/** Status-route sibling of {@link createDemoComposition} (FW-0068). */
export function createDemoStatusRouteComposition(): Composition {
  return createStubStatusRouteComposition();
}

/** Obligations-route sibling of {@link createDemoComposition} (FW-0055 slice 1). */
export function createDemoObligationsRouteComposition(): Composition {
  return createStubObligationsRouteComposition();
}

/** Documents-route sibling of {@link createDemoComposition} (FW-0056 slice 1). */
export function createDemoDocumentsRouteComposition(): Composition {
  return createStubDocumentsRouteComposition();
}
