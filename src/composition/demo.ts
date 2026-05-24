import { createStubComposition, createStubStatusRouteComposition } from './stub.ts';
import type { Composition } from './types.ts';

export function createDemoComposition(): Composition {
  return createStubComposition();
}

/** Status-route sibling of {@link createDemoComposition} (FW-0068). */
export function createDemoStatusRouteComposition(): Composition {
  return createStubStatusRouteComposition();
}
