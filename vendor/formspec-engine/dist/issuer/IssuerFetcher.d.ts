/** @filedesc Issuer document HTTP fetcher port and default fetch-backed adapter. */
import type { Issuer } from './types';
export interface IssuerFetchOptions {
    ifNoneMatch?: string;
}
export interface IssuerFetchedResult {
    issuer: Issuer;
    rawBytes: Uint8Array;
    etag?: string;
    cacheControl?: string;
    notModified?: false;
}
export interface IssuerNotModifiedResult {
    notModified: true;
    etag?: string;
    cacheControl?: string;
}
export type IssuerFetchResult = IssuerFetchedResult | IssuerNotModifiedResult;
export interface IssuerFetcher {
    fetch(url: string, options?: IssuerFetchOptions): Promise<IssuerFetchResult>;
}
export interface FetchIssuerFetcherOptions {
    fetch?: typeof globalThis.fetch;
}
export declare class FetchIssuerFetcher implements IssuerFetcher {
    private readonly _fetch;
    constructor(options?: FetchIssuerFetcherOptions);
    fetch(url: string, options?: IssuerFetchOptions): Promise<IssuerFetchResult>;
}
