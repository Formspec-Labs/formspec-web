/** @filedesc App Manifest 2.4 entry Surface and selected route validation. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
/**
 * Select the App Manifest 2.4 entry Surface and validate that Surface's entry.
 *
 * An explicit selection error is terminal for this pass. The validator never
 * falls back to the first or sole loaded Surface after an invalid selector.
 */
export declare function validateAppEntry(context: AppGraphContext): AppGraphDiagnostic[];
