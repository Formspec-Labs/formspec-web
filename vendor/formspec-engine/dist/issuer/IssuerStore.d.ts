/** @filedesc Issuer fetch, cache, cascade, and parent-chain walk with cycle/depth guards. */
import type { IssuerSource, ResolvedIssuer } from './types';
import type { IssuerFetcher } from './IssuerFetcher';
export declare const MAX_CHAIN_DEPTH = 8;
export interface IssuerResolveInput {
    definitionIssuer?: IssuerSource;
    hostOverride?: IssuerSource;
}
export interface IssuerStoreOptions {
    now?: () => number;
    defaultMaxAgeMs?: number;
}
export declare class IssuerStore {
    private readonly _fetcher;
    private readonly _cache;
    private readonly _now;
    private readonly _defaultMaxAgeMs;
    constructor(_fetcher: IssuerFetcher, options?: IssuerStoreOptions);
    invalidate(url: string): void;
    resolve(input: IssuerResolveInput): Promise<ResolvedIssuer>;
    private materialize;
    private fetchCached;
    private storeFresh;
    private refreshCacheEntry;
    private storeEntry;
    private walkChain;
}
