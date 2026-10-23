import createClient from 'openapi-fetch';
import type { paths as WosPaths } from './generated/wos-public.d.ts';
import type { paths as SourcePaths } from './generated/source-public.d.ts';

export type WosPublicClient = ReturnType<typeof createClient<WosPaths>>;
export type SourcePublicClient = ReturnType<typeof createClient<SourcePaths>>;

export interface CreateApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createWosClient(options: CreateApiClientOptions = {}): WosPublicClient {
  return createClient<WosPaths>({
    baseUrl: options.baseUrl ?? '',
    fetch: options.fetch,
  });
}

export function createSourceClient(options: CreateApiClientOptions = {}): SourcePublicClient {
  return createClient<SourcePaths>({
    baseUrl: options.baseUrl ?? '',
    fetch: options.fetch,
  });
}

export type { paths as WosPaths } from './generated/wos-public.d.ts';
export type { paths as SourcePaths } from './generated/source-public.d.ts';
