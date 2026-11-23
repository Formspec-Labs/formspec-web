/** @filedesc Scoped duplicate-title warnings for content that can render together. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
export declare const UX_TITLE_DUPLICATE_CODE = "APP-GRAPH-UX-TITLE-DUPLICATE";
/** Check titles within proven display scopes and resolved section plans. */
export declare function validateUxTitleDuplicates(context: AppGraphContext): AppGraphDiagnostic[];
