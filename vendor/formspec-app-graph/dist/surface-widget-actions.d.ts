/** @filedesc Surface module-widget action binding and transition checks. */
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
import { type JsonRecord } from './surface-widgets.js';
export declare function routeHasWidgetActionSource(context: AppGraphContext, surface: ResolvedArtifactHandle, route: JsonRecord, actionIds: readonly string[]): boolean;
export declare function validateSurfaceWidgetActions(context: AppGraphContext): AppGraphDiagnostic[];
