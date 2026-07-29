import { describe, expect, it } from 'vitest';
import {
  HttpSurfaceBundleSource,
  type FetchLike,
} from '../../../src/adapters/http/index.ts';
import { SurfaceBundleSourceError } from '../../../src/ports/surface-bundle-source.ts';

const ORIGIN = 'https://bundles.example.test';
const LOCATOR = `${ORIGIN}/current.bundle`;

describe('HttpSurfaceBundleSource', () => {
  it('records response status and cache identity as host observations', async () => {
    const source = createSource(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { etag: '"release-42"' },
      }),
    );
    const snapshot = await source.acquire({ locator: LOCATOR });
    expect(snapshot.evidence).toMatchObject({
      responseStatus: 200,
      cacheIdentity: '"release-42"',
      requestedLocator: LOCATOR,
      resolvedLocator: LOCATOR,
      byteCount: 3,
    });
  });

  it('classifies non-success status without reading bundle-derived text', async () => {
    const source = createSource(async () =>
      new Response('attacker-controlled failure text', { status: 503 }),
    );
    await expect(source.acquire({ locator: LOCATOR })).rejects.toMatchObject({
      name: SurfaceBundleSourceError.name,
      code: 'unavailable',
      message: 'Surface bundle source returned HTTP 503.',
    });
  });

  it('stops a streaming response when the byte limit is crossed', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const source = createSource(async () => new Response(stream), { maxBytes: 4 });
    await expect(source.acquire({ locator: LOCATOR })).rejects.toMatchObject({
      name: SurfaceBundleSourceError.name,
      code: 'size-limit-exceeded',
    });
  });

  it('refuses redirects before following an untrusted location', async () => {
    const source = createSource(async () =>
      new Response(undefined, {
        status: 302,
        headers: { location: 'https://attacker.example/bundle' },
      }),
    );
    await expect(source.acquire({ locator: LOCATOR })).rejects.toMatchObject({
      name: SurfaceBundleSourceError.name,
      code: 'disallowed-location',
    });
  });

  it('maps an in-flight fetch abort to the typed cancellation result', async () => {
    const fetchImpl: FetchLike = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });
    const source = createSource(fetchImpl);
    const controller = new AbortController();
    const acquisition = source.acquire({
      locator: LOCATOR,
      signal: controller.signal,
    });
    controller.abort();
    await expect(acquisition).rejects.toMatchObject({
      name: SurfaceBundleSourceError.name,
      code: 'cancelled',
    });
  });

  it('returns a typed timeout when an allowed origin stalls', async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchImpl: FetchLike = async (_input, init) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    };
    const source = createSource(fetchImpl, { timeoutMs: 10 });

    await expect(source.acquire({ locator: LOCATOR })).rejects.toMatchObject({
      name: SurfaceBundleSourceError.name,
      code: 'timeout',
      message: 'Surface bundle acquisition exceeded the configured 10 ms deadline.',
    });
    expect(observedSignal?.aborted).toBe(true);
  });
});

function createSource(
  fetchImpl: FetchLike,
  overrides: {
    readonly maxBytes?: number;
    readonly timeoutMs?: number;
  } = {},
): HttpSurfaceBundleSource {
  return new HttpSurfaceBundleSource({
    allowedOrigins: [ORIGIN],
    maxBytes: overrides.maxBytes ?? 1024,
    timeoutMs: overrides.timeoutMs ?? 1_000,
    redirectPolicy: 'refuse',
    fetchImpl,
    now: () => new Date('2026-07-28T16:00:00.000Z'),
  });
}
