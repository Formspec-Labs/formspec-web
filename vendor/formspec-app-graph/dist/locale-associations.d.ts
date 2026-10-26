/** @filedesc App Manifest 2.4+ Locale reference and target coherence checks. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
import { type JsonRecord } from './surface-widgets.js';
export declare const LOCALE_ASSOCIATION_CODES: {
    readonly localeRef: "APP-GRAPH-LOCALE-REF";
    readonly localeTarget: "APP-GRAPH-LOCALE-TARGET";
    readonly localeDuplicate: "APP-GRAPH-LOCALE-DUPLICATE";
    readonly localeUiChromeMissing: "APP-GRAPH-LOCALE-UI-CHROME-MISSING";
};
/**
 * Normalize the case conventions that are significant to BCP 47 comparison.
 *
 * The source schemas already constrain the tag grammar. This function does not
 * expand aliases or consult an external language registry.
 */
export declare function normalizeLocaleTag(locale: string): string;
/** The Definition URL a Component document renders, under any of its target spellings. */
export declare function componentTargetUrl(compDoc: JsonRecord | undefined): string | undefined;
export declare function validateLocaleAssociations(context: AppGraphContext): AppGraphDiagnostic[];
