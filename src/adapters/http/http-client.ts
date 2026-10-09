import type { TenantBindingConfig } from '../../config/types.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { IDEMPOTENCY_KEY_HEADER } from '../../shared/idempotency-key.ts';
import { isProblemJson, type ProblemJson } from '../../shared/problem-json.ts';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AccessTokenProvider = () => Promise<string | undefined> | string | undefined;

export interface HttpClientConfig {
  baseUrl: string;
  tenantBinding?: TenantBindingConfig;
  fetchImpl?: FetchLike;
  accessToken?: string | AccessTokenProvider;
}

export interface JsonRequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
  requireJson?: boolean;
  requireNoStore?: boolean;
  idempotencyKey?: string;
  headers?: HeadersInit;
  /** Optional admitted request catalog status allowlist. */
  successStatuses?: readonly number[];
  /** Caller-owned lifetime check after asynchronous credential resolution, before dispatch. */
  assertCurrent?: () => void;
  /** Effect admission after credentials, immediately before fetch; never called after dispatch. */
  assertBeforeDispatch?: () => void;
}

export class HttpAdapterError extends Error {
  readonly status: number;
  readonly problem?: ProblemJson;
  readonly responseBody?: unknown;

  constructor(message: string, status: number, problem?: ProblemJson, responseBody?: unknown) {
    super(message);
    this.name = 'HttpAdapterError';
    this.status = status;
    this.problem = problem;
    this.responseBody = responseBody;
  }
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly tenantBinding?: TenantBindingConfig;
  private readonly accessToken?: string | AccessTokenProvider;

  constructor(config: HttpClientConfig) {
    if (!config.baseUrl.trim()) {
      throw new Error('HttpClient baseUrl is required');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.tenantBinding = config.tenantBinding ? structuredClone(config.tenantBinding) : undefined;
    this.accessToken = config.accessToken;
  }

  async getJson<T>(path: string, options?: JsonRequestOptions): Promise<T> {
    return this.requestJson<T>('GET', path, options);
  }

  async postJson<T>(path: string, body: unknown, options?: JsonRequestOptions): Promise<T> {
    return this.requestJson<T>('POST', path, { ...options, body });
  }

  async patchJson<T>(path: string, body: unknown, options?: JsonRequestOptions): Promise<T> {
    return this.requestJson<T>('PATCH', path, { ...options, body });
  }

  async requestJson<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: JsonRequestOptions = {},
  ): Promise<T> {
    const lifetime = requestLifetime(options);
    const { signal } = lifetime;
    let response: Response | undefined;
    try {
      const check = () => { signal?.throwIfAborted(); options.assertCurrent?.(); };
      check();
      const headers = await withAbort(this.headersFor(options), signal);
      check();
      const admission: unknown = options.assertBeforeDispatch?.();
      if (admission !== undefined) {
        // A Promise-returning callback cannot authorize a synchronous effect boundary.
        void Promise.resolve(admission).catch(() => {});
        throw new Error('Effect dispatch assertion must be synchronous and return no value');
      }
      const pendingResponse = this.fetchImpl(this.urlFor(path), {
        method,
        redirect: 'error',
        headers,
        signal,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      // A noncooperative transport may settle after cancellation; release its unread body.
      void pendingResponse.then(value => { if (signal?.aborted) cancelBody(value); }, () => {});
      response = await withAbort(pendingResponse, signal);
      check();
      const payload = await readResponsePayload(response, options, signal);
      check();
      if (!response.ok || (options.successStatuses !== undefined && !options.successStatuses.includes(response.status))) {
        const problem = isProblemJson(payload) ? payload : undefined;
        const title = response.ok
          ? 'HTTP response status does not match the admitted request'
          : (problem?.title ?? response.statusText) || 'HTTP adapter request failed';
        throw new HttpAdapterError(title, response.status, problem, payload);
      }
      if (options.requireNoStore && !response.headers.get('cache-control')?.split(',').some(value => value.trim().toLowerCase() === 'no-store')) {
        throw new Error('HTTP response must prohibit storage');
      }
      return payload as T;
    } finally {
      if (response) cancelBody(response);
      lifetime.dispose();
    }
  }

  private async headersFor(options: JsonRequestOptions): Promise<Headers> {
    const headers = new Headers(options.headers);
    headers.set('accept', 'application/json');
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    if (this.tenantBinding) {
      for (const [name, value] of Object.entries(tenantScopeHeaders(this.tenantBinding))) {
        headers.set(name, value);
      }
    }
    const token = await resolveAccessToken(this.accessToken);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    if (options.idempotencyKey) {
      headers.set(IDEMPOTENCY_KEY_HEADER, options.idempotencyKey);
    }
    return headers;
  }

  private urlFor(path: string): string {
    if (/^https?:\/\//.test(path)) {
      return path;
    }
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }
}

async function resolveAccessToken(
  accessToken: string | AccessTokenProvider | undefined,
): Promise<string | undefined> {
  if (typeof accessToken === 'function') {
    return accessToken();
  }
  return accessToken;
}

function requestLifetime(options: JsonRequestOptions): { signal?: AbortSignal; dispose(): void } {
  if (options.timeoutMs === undefined) return { signal: options.signal, dispose() {} };
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('HTTP timeout must be a positive integer');
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('HTTP request timed out', 'TimeoutError')), options.timeoutMs);
  return { signal: controller.signal, dispose() { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); } };
}

/** Also fences adapters or credential providers that do not honor AbortSignal. */
async function withAbort<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  // Consume a synchronous-abort provider rejection even when the signal retired during invocation.
  if (signal.aborted) { void pending.catch(() => {}); signal.throwIfAborted(); }
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    })]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

async function readResponsePayload(response: Response, options: JsonRequestOptions, signal?: AbortSignal): Promise<unknown> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (options.requireJson && !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('HTTP response must contain JSON');
  }
  let text: string;
  if (options.maxResponseBytes === undefined) text = await withAbort(response.text(), signal);
  else {
    const limit = options.maxResponseBytes;
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('HTTP response limit must be a positive integer');
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (reader) {
        const next = await withAbort(reader.read(), signal);
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > limit) throw new Error('HTTP response exceeds the admitted byte limit');
        chunks.push(next.value);
      }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      text = new TextDecoder('utf-8', { fatal: true }).decode(joined);
    } finally {
      void reader?.cancel().catch(() => {});
    }
  }
  if (!text) return undefined;
  if (!contentType.includes('json')) return text;
  return JSON.parse(text) as unknown;
}

function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => {});
}
