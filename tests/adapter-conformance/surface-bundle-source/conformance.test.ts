import {
  HttpSurfaceBundleSource,
  type FetchLike,
} from '../../../src/adapters/http/index.ts';
import { RawSurfaceBundleSource } from '../../../src/adapters/raw/index.ts';
import { defineSurfaceBundleSourceConformance } from '../_framework/conformance.ts';

const LOCATOR = 'https://bundles.example.test/current.bundle';
const MISSING = 'https://bundles.example.test/missing.bundle';
const OVERSIZED = 'https://bundles.example.test/oversized.bundle';
const CANDIDATE = new Uint8Array([0x7b, 0x7d, 0x0a]);
const LARGE_CANDIDATE = new Uint8Array([1, 2, 3, 4, 5]);

defineSurfaceBundleSourceConformance('raw SurfaceBundleSource conformance', () => ({
  adapter: new RawSurfaceBundleSource({
    candidates: [
      [LOCATOR, CANDIDATE],
      [OVERSIZED, LARGE_CANDIDATE],
    ],
    maxBytes: 4,
    now: () => new Date('2026-07-28T16:00:00.000Z'),
  }),
  locator: LOCATOR,
  expectedBytes: CANDIDATE,
  missingLocator: MISSING,
  oversizedLocator: OVERSIZED,
}));

defineSurfaceBundleSourceConformance('HTTP SurfaceBundleSource conformance', () => ({
  adapter: new HttpSurfaceBundleSource({
    allowedOrigins: ['https://bundles.example.test'],
    maxBytes: 4,
    timeoutMs: 1_000,
    redirectPolicy: 'refuse',
    fetchImpl: fixtureFetch(),
    now: () => new Date('2026-07-28T16:00:00.000Z'),
  }),
  locator: LOCATOR,
  expectedBytes: CANDIDATE,
  missingLocator: MISSING,
  oversizedLocator: OVERSIZED,
}));

function fixtureFetch(): FetchLike {
  return async (input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const url = input instanceof Request ? input.url : input.toString();
    if (url === MISSING) {
      return new Response(undefined, { status: 404 });
    }
    if (url === OVERSIZED) {
      return new Response(LARGE_CANDIDATE, {
        status: 200,
        headers: { 'content-length': String(LARGE_CANDIDATE.byteLength) },
      });
    }
    return new Response(CANDIDATE, {
      status: 200,
      headers: {
        'content-length': String(CANDIDATE.byteLength),
        etag: '"candidate-v1"',
      },
    });
  };
}
