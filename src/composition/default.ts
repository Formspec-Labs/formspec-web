import { createStubComposition } from './stub.ts';
import type { Composition } from './types.ts';

/**
 * Default composition for the OSS reference deployment.
 *
 * Currently identical to the stub composition; HTTP reference adapters for
 * the formspec-stack composition (per web ADR-0008) land when consumer code
 * drives them. Adopters running a different stack (Firebase + Supabase +
 * Cloudflare Workers, login.gov + AWS, etc.) fork this file and wire their
 * own adapters against the same port interfaces.
 */
export function createDefaultComposition(): Composition {
  return createStubComposition();
}
