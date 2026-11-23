import { type ResolvedBundle } from '@formspec-org/surface';
import { type SurfaceAppProps } from './SurfaceApp.js';
import { type SurfaceBrowserMode } from './browser-location.js';
import type { ResponseSelector } from '@formspec-org/types';
import { type SurfaceDraftStorage } from './draft-session.js';
import type { DraftCheckpointPorts } from './draft-writer.js';
import type { DataSourceLoader } from '@formspec-org/surface';
export interface SurfacePreviewEdition {
    /** Stable browser draft scope, unique to this edition on the hosting origin. */
    scope: string;
    bundle: ResolvedBundle;
    adapters: SurfaceHostAdapters;
    initialPath: string;
}
export interface SurfaceBrowserVisit {
    path: string | undefined;
    previewScope: string | undefined;
}
export type SurfaceHostAdapters = Omit<SurfaceAppProps, 'bundle' | 'location' | 'onNavigate' | 'resolveNavigationHref' | 'activeLocale' | 'header' | 'appTitle' | 'strings' | 'resolveRouteTitle' | 'navigationLabel'> & {
    mode?: SurfaceBrowserMode;
    responses?: ResponseSelector;
    withResponseLoader?: (readResponse: DataSourceLoader) => DataSourceLoader;
    /** Storage selected by this composition. */
    draftStorage?: Omit<SurfaceDraftStorage, 'responses'> | undefined;
    /** Host preconditions and unrelated effects for actions that checkpoint a draft. */
    checkpointPorts?: DraftCheckpointPorts | undefined;
    /** Absolute mount pathname in history mode. Serve the app at deep paths under it. */
    basePath?: string;
    /** Await the current draft writer before controlled route and edition changes. */
    beforeLeave?: ((visit: SurfaceBrowserVisit) => boolean | Promise<boolean>) | undefined;
};
type PreviewEditions = readonly [SurfacePreviewEdition, ...SurfacePreviewEdition[]];
export type BrowserSurfaceAppProps = {
    bundle: ResolvedBundle;
    adapters: SurfaceHostAdapters;
    previewEditions?: never;
} | {
    previewEditions: PreviewEditions;
    adapters?: Pick<SurfaceHostAdapters, 'mode'>;
    bundle?: never;
};
export declare function BrowserSurfaceApp(input: BrowserSurfaceAppProps): import("react/jsx-runtime").JSX.Element;
export {};
