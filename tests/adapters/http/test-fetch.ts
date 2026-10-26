import { IDEMPOTENCY_KEY_HEADER } from '../../../src/shared/idempotency-key.ts';
import { parseJsonExact } from '@formspec-org/integrity-canonical';

export interface CapturedHttpRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  bodyText?: string;
}

export type MockRoute = (request: CapturedHttpRequest) => Response | Promise<Response>;

export function recordingFetch(route: MockRoute): {
  fetch: typeof fetch;
  requests: CapturedHttpRequest[];
} {
  const requests: CapturedHttpRequest[] = [];
  return {
    requests,
    fetch: async (input, init) => {
      const request: CapturedHttpRequest = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: bodyFromInit(init),
        ...(typeof init?.body === 'string' ? { bodyText: init.body } : {}),
      };
      requests.push(request);
      return route(request);
    },
  };
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function problemResponse(status: number, title: string): Response {
  return jsonResponse(
    {
      type: 'about:blank',
      title,
      status,
      error_code: `FORMSPEC-${status}0`,
      detail: title,
    },
    status,
  );
}

export function idempotencyKey(request: CapturedHttpRequest): string | null {
  return request.headers.get(IDEMPOTENCY_KEY_HEADER);
}

function bodyFromInit(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    return undefined;
  }
  return parseJsonExact(init.body);
}
