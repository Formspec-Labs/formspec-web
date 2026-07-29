import type {
  SurfaceBundleAcquisitionRequest,
  SurfaceBundleSnapshot,
  SurfaceBundleSource,
} from '../../ports/surface-bundle-source.ts';
import {
  SurfaceBundleSourceError,
  createSurfaceBundleSnapshot,
} from '../../ports/surface-bundle-source.ts';
import type { FetchLike } from './http-client.ts';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface HttpSurfaceBundleSourceConfig {
  readonly allowedOrigins: readonly string[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly redirectPolicy: 'refuse' | 'same-origin';
  readonly maxRedirects?: number;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  readonly adapterId?: string;
}

export class HttpSurfaceBundleSource implements SurfaceBundleSource {
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly redirectPolicy: 'refuse' | 'same-origin';
  private readonly maxRedirects: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly adapterId: string;

  constructor(config: HttpSurfaceBundleSourceConfig) {
    if (!Number.isSafeInteger(config.maxBytes) || config.maxBytes <= 0) {
      throw new Error('HttpSurfaceBundleSource maxBytes must be a positive safe integer');
    }
    if (config.allowedOrigins.length === 0) {
      throw new Error('HttpSurfaceBundleSource requires at least one allowed origin');
    }
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0) {
      throw new Error('HttpSurfaceBundleSource timeoutMs must be a positive safe integer');
    }
    this.allowedOrigins = new Set(config.allowedOrigins.map(normalizeOrigin));
    this.maxBytes = config.maxBytes;
    this.timeoutMs = config.timeoutMs;
    this.redirectPolicy = config.redirectPolicy;
    this.maxRedirects = config.maxRedirects ?? 0;
    if (!Number.isSafeInteger(this.maxRedirects) || this.maxRedirects < 0) {
      throw new Error('HttpSurfaceBundleSource maxRedirects must be a non-negative safe integer');
    }
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = config.now ?? (() => new Date());
    this.adapterId = config.adapterId ?? 'urn:formspec-web:surface-bundle-source:http@1';
  }

  async acquire(request: SurfaceBundleAcquisitionRequest): Promise<SurfaceBundleSnapshot> {
    assertNotCancelled(request.signal);
    const controller = new AbortController();
    let rejectInterruption: (reason: SurfaceBundleSourceError) => void = () => undefined;
    const interruption = new Promise<never>((_resolve, reject) => {
      rejectInterruption = reject;
    });
    const interrupt = (error: SurfaceBundleSourceError): void => {
      if (controller.signal.aborted) return;
      rejectInterruption(error);
      controller.abort();
    };
    const onRequestAbort = (): void => {
      interrupt(
        new SurfaceBundleSourceError(
          'cancelled',
          'Surface bundle acquisition was cancelled.',
        ),
      );
    };
    request.signal?.addEventListener('abort', onRequestAbort, { once: true });
    const timeout = globalThis.setTimeout(() => {
      interrupt(
        new SurfaceBundleSourceError(
          'timeout',
          `Surface bundle acquisition exceeded the configured ${this.timeoutMs} ms deadline.`,
        ),
      );
    }, this.timeoutMs);

    try {
      return await Promise.race([
        this.acquireWithinDeadline(request.locator, controller.signal),
        interruption,
      ]);
    } finally {
      globalThis.clearTimeout(timeout);
      request.signal?.removeEventListener('abort', onRequestAbort);
    }
  }

  private async acquireWithinDeadline(
    locator: string,
    signal: AbortSignal,
  ): Promise<SurfaceBundleSnapshot> {
    let current = parseAllowedUrl(locator, this.allowedOrigins);
    const requestedLocator = current.href;
    let redirects = 0;

    try {
      while (true) {
        const response = await this.fetchImpl(current, {
          method: 'GET',
          headers: { accept: 'application/json, application/octet-stream' },
          redirect: 'manual',
          signal,
        });
        assertNotCancelled(signal);

        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            throw new SurfaceBundleSourceError(
              'malformed-response',
              `Surface bundle redirect ${response.status} omitted Location.`,
            );
          }
          if (this.redirectPolicy === 'refuse') {
            throw new SurfaceBundleSourceError(
              'disallowed-location',
              'Surface bundle redirects are disabled.',
            );
          }
          redirects += 1;
          if (redirects > this.maxRedirects) {
            throw new SurfaceBundleSourceError(
              'disallowed-location',
              'Surface bundle redirect limit was exceeded.',
            );
          }
          const next = parseAllowedUrl(new URL(location, current).href, this.allowedOrigins);
          if (next.origin !== current.origin) {
            throw new SurfaceBundleSourceError(
              'disallowed-location',
              'Surface bundle redirect changed origin.',
            );
          }
          current = next;
          continue;
        }

        if (response.status === 404) {
          throw new SurfaceBundleSourceError('not-found', 'Surface bundle was not found.');
        }
        if (!response.ok) {
          throw new SurfaceBundleSourceError(
            'unavailable',
            `Surface bundle source returned HTTP ${response.status}.`,
          );
        }

        const bytes = await readLimitedBytes(response, this.maxBytes, signal);
        const acquiredAt = readClock(this.now);
        const cacheIdentity =
          response.headers.get('etag') ?? response.headers.get('last-modified') ?? undefined;
        return createSurfaceBundleSnapshot(bytes, {
          adapterId: this.adapterId,
          requestedLocator,
          resolvedLocator: current.href,
          acquiredAt,
          responseStatus: response.status,
          ...(cacheIdentity ? { cacheIdentity } : {}),
        });
      }
    } catch (error) {
      if (error instanceof SurfaceBundleSourceError) {
        throw error;
      }
      if (signal.aborted || isAbortError(error)) {
        throw new SurfaceBundleSourceError(
          'cancelled',
          'Surface bundle acquisition was cancelled.',
          { cause: error },
        );
      }
      throw new SurfaceBundleSourceError(
        'internal',
        'Surface bundle source failed unexpectedly.',
        { cause: error },
      );
    }
  }
}

export function createHttpSurfaceBundleSource(
  config: HttpSurfaceBundleSourceConfig,
): HttpSurfaceBundleSource {
  return new HttpSurfaceBundleSource(config);
}

async function readLimitedBytes(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      throw new SurfaceBundleSourceError(
        'malformed-response',
        'Surface bundle Content-Length was not a non-negative integer.',
      );
    }
    if (Number(contentLength) > maxBytes) {
      throw new SurfaceBundleSourceError(
        'size-limit-exceeded',
        `Surface bundle exceeds the configured ${maxBytes}-byte limit.`,
      );
    }
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    enforceSize(bytes.byteLength, maxBytes);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      assertNotCancelled(signal);
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel();
        throw new SurfaceBundleSourceError(
          'size-limit-exceeded',
          `Surface bundle exceeds the configured ${maxBytes}-byte limit.`,
        );
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function enforceSize(byteCount: number, maxBytes: number): void {
  if (byteCount > maxBytes) {
    throw new SurfaceBundleSourceError(
      'size-limit-exceeded',
      `Surface bundle exceeds the configured ${maxBytes}-byte limit.`,
    );
  }
}

function parseAllowedUrl(locator: string, allowedOrigins: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(locator);
  } catch (error) {
    throw new SurfaceBundleSourceError(
      'disallowed-location',
      'Surface bundle locator must be an absolute HTTPS URL.',
      { cause: error },
    );
  }
  if (url.protocol !== 'https:' || !allowedOrigins.has(url.origin)) {
    throw new SurfaceBundleSourceError(
      'disallowed-location',
      'Surface bundle locator is outside the configured HTTPS origins.',
    );
  }
  return url;
}

function normalizeOrigin(origin: string): string {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin.replace(/\/$/u, '')) {
    throw new Error(`Invalid allowed Surface bundle origin: ${origin}`);
  }
  return parsed.origin;
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SurfaceBundleSourceError(
      'cancelled',
      'Surface bundle acquisition was cancelled.',
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function readClock(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new SurfaceBundleSourceError('internal', 'Surface bundle source clock is invalid.');
  }
  return value.toISOString();
}
