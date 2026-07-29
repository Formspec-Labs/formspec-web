/** @filedesc Surface transition trigger validation against Response Actions. */
import { type AppGraphContext, type AppGraphDiagnostic } from './types.js';
export { CLOSED_RESPONSE_ACTION_INTENTS } from './response-action-resolution.js';
export declare function validateSurfaceResponseActionTriggers(context: AppGraphContext): AppGraphDiagnostic[];
