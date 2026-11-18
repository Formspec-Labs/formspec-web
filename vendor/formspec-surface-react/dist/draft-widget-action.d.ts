import type { FormDefinition } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';
import type { SurfaceWidgetActionExecutor } from './widget-api.js';
export declare function fenceDraftWidgetActions(executor: SurfaceWidgetActionExecutor, session: DraftSession, definitions: ReadonlyMap<string, FormDefinition>, current: () => boolean): SurfaceWidgetActionExecutor;
