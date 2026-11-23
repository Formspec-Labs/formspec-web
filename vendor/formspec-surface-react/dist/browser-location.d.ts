/** @filedesc Read and write Surface addresses through browser session history. */
import { type MouseEvent } from 'react';
export type SurfaceBrowserMode = 'history' | 'hash';
interface SurfaceLocation {
    path: string;
    query: URLSearchParams;
}
export declare function useSurfaceBrowserAddress(mode: SurfaceBrowserMode): {
    address: string;
    routeAddress: string;
    anchor: boolean;
    currentRouteAddress: () => string;
};
export declare function pushBrowserAddress(href: string, scroll: boolean): boolean;
export declare function splitSurfaceLocation(location: string): SurfaceLocation;
/** The location with one query parameter set and the others kept. */
export declare function withSurfaceQuery(location: string, name: string, value: string): string;
export declare function surfaceBrowserLocation(mode: SurfaceBrowserMode, basePath: string): {
    read(address: string): SurfaceLocation | undefined;
    href(path: string, query: URLSearchParams): string | undefined;
};
/** History pathname and navigation for an embedded controlled SurfaceApp. */
export declare function useBrowserLocation(fallback?: string): [string, (href: string) => void];
export declare function isPlainLinkClick(event: MouseEvent): boolean;
export {};
