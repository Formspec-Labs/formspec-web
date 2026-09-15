/** @filedesc Safe browser navigation and download adapter for structured app actions. */
import type { ResponseActionEffectOutcome } from '@formspec-org/engine';
export interface BrowserResourceEffectInput {
    type: 'browserResource';
    operation: 'open' | 'download';
    resourceRef: string;
    target?: 'self' | 'new' | undefined;
}
export interface BrowserOpenResource {
    href: string;
}
export interface BrowserDownloadResource {
    filename: string;
    mediaType: string;
    content: string | ArrayBuffer;
}
/**
 * A demand-driven download from the host's configured service boundary.
 *
 * Structured artifacts may name only a same-service path. The host owns the
 * service origin and authentication transport, so tenant headers and bearer
 * credentials never become authored application data.
 */
export interface BrowserServiceDownloadResource {
    kind: 'host-service-download';
    path: string;
    filename: string;
    mediaType: string;
}
export type BrowserResourceCommand = Readonly<{
    operation: 'open';
    href: string;
    target: 'self' | 'new';
}> | Readonly<{
    operation: 'download';
    source: 'inline';
    filename: string;
    mediaType: string;
    content: string;
}> | Readonly<{
    operation: 'download';
    source: 'host-service';
    path: string;
    filename: string;
    mediaType: string;
}>;
export type BrowserResourceResolution = Readonly<{
    ok: true;
    command: BrowserResourceCommand;
}> | Readonly<{
    ok: false;
    reason: string;
}>;
export interface BrowserResourcePorts {
    open(href: string, target: 'self' | 'new'): void;
    download(resource: BrowserDownloadResource): void;
    /** Performs an authenticated request against the host-configured service. */
    fetchServiceResource?(path: string): Promise<BrowserServiceResponse>;
    /** Host admission ceiling. Defaults to 10 MiB when omitted. */
    maxServiceDownloadBytes?: number | undefined;
}
/** Minimal response surface needed by the generic download adapter. */
export interface BrowserServiceResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly headers: Pick<Headers, 'get'>;
    readonly body?: ReadableStream<Uint8Array> | null | undefined;
    arrayBuffer(): Promise<ArrayBuffer>;
}
export declare function resolveBrowserResourceCommand(candidateEffect: unknown, input: unknown): BrowserResourceResolution;
export declare function executeBrowserResourceEffect(effect: unknown, input: unknown, ports: BrowserResourcePorts): Promise<ResponseActionEffectOutcome>;
