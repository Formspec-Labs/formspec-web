/** @filedesc App Manifest 2.4 Locale reference and target coherence checks. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
/**
 * Normalize the case conventions that are significant to BCP 47 comparison.
 *
 * The source schemas already constrain the tag grammar. This function does not
 * expand aliases or consult an external language registry.
 */
export declare function normalizeLocaleTag(locale: string): string;
export declare function validateLocaleAssociations(context: AppGraphContext): AppGraphDiagnostic[];
