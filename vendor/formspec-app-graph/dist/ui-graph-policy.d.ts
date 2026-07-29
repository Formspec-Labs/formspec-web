/** @filedesc Built-in UI Graph Policy validation for loaded app-graph evidence. */
import { type AppGraphContext, type AppGraphDiagnostic } from './types.js';
import type { SurfaceDocument } from '@formspec-org/types';
/**
 * The Surface route-class vocabulary, taken from the schema-generated type
 * rather than restated. A new or renamed `routeClass` enum member changes this
 * union, which breaks `ROUTE_CLASS_THEME_AUTHORITY` at compile time.
 */
type RouteClass = NonNullable<SurfaceDocument['routes'][number]['routeClass']>;
export declare const PLATFORM_TOKEN_CATEGORY_PREFIXES: Set<string>;
/**
 * Whether each route class admits tenant chrome theming. Exactly one value
 * admits: `intake`, a Definition-backed capture from a respondent. Every other
 * class refuses, because a third party relies on what it renders — an artifact
 * the platform issued, the act of signing one, the independent check of one, a
 * claim the publisher is accountable for, or a credential exchange whose chrome
 * is the anti-phishing control. `operation` refuses too: it is a residual value
 * for routes with nothing to declare, and a residual value on the permissive
 * side of the only rule keyed on this vocabulary is fail-open.
 *
 * Exhaustive over the schema-generated `RouteClass` union by construction: a new
 * or renamed `routeClass` enum member fails to compile HERE, at the decision
 * site, instead of silently defaulting to admitted. There is no `default` arm,
 * deliberately. Note what that does and does not buy — adding `attestation` and
 * `authentication` broke the build here as intended, and flipping `operation`
 * from `admits` to `refuses` did not, because a wrong-but-total map still
 * compiles. The vocabulary's members are compiler-checked; their postures are
 * checked by `tests/ui-graph-policy-route-class.test.ts` and by running the
 * vocabulary over a real route corpus.
 *
 * `surface-spec.md` §3 Route Class; `ui-graph-policy-spec.md` §5.7.
 */
export declare const ROUTE_CLASS_THEME_AUTHORITY: {
    readonly intake: "admits";
    readonly proof: "refuses";
    readonly ceremony: "refuses";
    readonly verification: "refuses";
    readonly attestation: "refuses";
    readonly authentication: "refuses";
    readonly operation: "refuses";
};
/**
 * The `refuses` half of {@link ROUTE_CLASS_THEME_AUTHORITY}, derived rather than
 * restated. An unclassified route has stated nothing, so no rule keyed on a
 * class fires against it.
 */
export declare const TENANT_THEMING_REFUSING_ROUTE_CLASSES: ReadonlySet<RouteClass>;
export declare function validateUiGraphPolicy(context: AppGraphContext): AppGraphDiagnostic[];
export {};
