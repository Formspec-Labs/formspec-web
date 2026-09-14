/** @filedesc Scoped duplicate-title warnings for content that can render together. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
export declare const UX_TITLE_DUPLICATE_CODE = "APP-GRAPH-UX-TITLE-DUPLICATE";
/**
 * Title comparison deliberately does not fold case. AppGraph does not resolve
 * the display locale for these authored strings, so a locale-independent case
 * guess would create false positives.
 */
export declare function normalizeUxTitle(value: string): string;
/**
 * Warn about duplicate visible titles only where the loaded graph proves a
 * shared display scope.
 *
 * This pass intentionally omits Theme pages and Definition-generated pages.
 * Determining whether those pages are active requires the layout planner's
 * Component > Theme > Definition selection, region resolution, and renderer
 * platform choice. AppGraph has no layout dependency, and comparing their raw
 * declarations would report inactive fallback titles. Top-level Component
 * Sections remain covered by the sibling rule because Component pages have
 * highest precedence and their authored headings share one tree.
 */
export declare function validateUxTitleDuplicates(context: AppGraphContext): AppGraphDiagnostic[];
