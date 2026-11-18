import { type ResolvedBundle } from '@formspec-org/surface';
import { type SurfaceAppProps } from './SurfaceApp.js';
import { type SurfaceBrowserMode } from './browser-location.js';
import { type SurfaceDraftStorage } from './draft-session.js';
import type { DraftCheckpointPorts } from './draft-writer.js';
export interface SurfacePreviewEdition {
    /** Stable browser draft scope, unique to this edition on the hosting origin. */
    scope: string;
    bundle: ResolvedBundle;
}
export interface SurfaceBrowserVisit {
    path: string | undefined;
    previewScope: string | undefined;
}
type BrowserSurfaceOptions = Omit<SurfaceAppProps, 'bundle' | 'location' | 'onNavigate' | 'resolveNavigationHref' | 'activeLocale' | 'header' | 'appTitle' | 'strings' | 'resolveRouteTitle' | 'navigationLabel'> & {
    mode?: SurfaceBrowserMode;
    /** Authorized host storage. Preview editions otherwise use browser IndexedDB. */
    draftStorage?: SurfaceDraftStorage | undefined;
    /** Host preconditions and unrelated effects for actions that checkpoint a draft. */
    checkpointPorts?: DraftCheckpointPorts | undefined;
    /** Absolute mount pathname in history mode. Serve the app at deep paths under it. */
    basePath?: string;
    /** Await the current draft writer before controlled route and edition changes. */
    beforeLeave?: ((visit: SurfaceBrowserVisit) => boolean | Promise<boolean>) | undefined;
};
export type BrowserSurfaceAppProps = BrowserSurfaceOptions & ({
    bundle: ResolvedBundle;
    previewEditions?: never;
} | {
    bundle?: never;
    previewEditions: readonly [SurfacePreviewEdition, ...SurfacePreviewEdition[]];
});
export declare function BrowserSurfaceApp({ mode, basePath, beforeLeave, previewEditions, draftStorage, checkpointPorts, ...props }: BrowserSurfaceAppProps): import("react/jsx-runtime").JSX.Element;
export {};
