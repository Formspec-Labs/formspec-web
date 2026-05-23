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
  idempotencyKey?: string;
  headers?: HeadersInit;
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
    this.tenantBinding = config.tenantBinding;
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
    const headers = await this.headersFor(options);
    const response = await this.fetchImpl(this.urlFor(path), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      const problem = isProblemJson(payload) ? payload : undefined;
      const title = (problem?.title ?? response.statusText) || 'HTTP adapter request failed';
      throw new HttpAdapterError(title, response.status, problem, payload);
    }
    return payload as T;
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

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    return text;
  }
  return JSON.parse(text) as unknown;
}
