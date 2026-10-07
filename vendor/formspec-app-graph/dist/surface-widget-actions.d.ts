/** @filedesc Surface module-widget action binding and transition checks. */
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
import { type ResponseActionReferences } from './response-action-resolution.js';
import { type JsonRecord, type RegistryWidgetEntry, type SurfaceWidgetSlot } from './surface-widgets.js';
/** Reuse manifested Definition and qualified source ownership for every widget consumer. */
export declare function widgetActionOwnershipMatches(context: AppGraphContext, widget: SurfaceWidgetSlot, contribution: RegistryWidgetEntry, binding: JsonRecord | undefined, action: ResponseActionReferences['actions'][number]): boolean;
export declare function routeHasWidgetActionSource(context: AppGraphContext, surface: ResolvedArtifactHandle, route: JsonRecord, actionIds: readonly string[]): boolean;
export declare function validateSurfaceWidgetActions(context: AppGraphContext): AppGraphDiagnostic[];
