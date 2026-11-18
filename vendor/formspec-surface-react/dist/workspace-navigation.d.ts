/** @filedesc Resolve the form slot that owns section navigation and the page title. */
import type { SurfaceRoutePlan } from '@formspec-org/surface';
import type { SurfaceWidget } from './widget-api.js';
export declare function activeWorkspaceSlot(plan: SurfaceRoutePlan<SurfaceWidget> | undefined, requestedSlot: string | undefined): string | undefined;
