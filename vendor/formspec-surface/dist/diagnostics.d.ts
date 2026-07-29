/**
 * @filedesc Diagnostics a Surface shell reports instead of failing quietly.
 *
 * The surface-render-v10 spike's sharpest finding was not a missing feature —
 * it was silence. A tenant's brand colour was accepted by authoring, passed
 * validation, was signed into the release, emitted by the renderer, resolved in
 * the cascade, and painted nothing, **with no diagnostic anywhere in that
 * chain**. This module exists so a shell never repeats that shape: every place
 * the shell has to make a call the platform does not state, it renders what it
 * can AND says what it did.
 *
 * These are runtime-composition diagnostics, distinct from
 * `AppGraphDiagnostic` (authoring-time, `@formspec-org/app-graph`) and from
 * lint codes (`crates/formspec-lint`). A shell sees things neither can: which
 * route the browser is actually on, whether a host supplied a transition
 * executor, whether two Surfaces collided in one URL space.
 *
 * ## Severity is a property of the code, not of the call site
 *
 * `specs/surface/surface-shell-spec.md` §7.1 requires every
 * diagnostic to carry a severity "fixed per code", which hosts "MAY elevate,
 * MUST NOT demote". Fixed per code means the caller does not get to pick:
 * {@link surfaceDiagnostic} reads {@link SURFACE_DIAGNOSTIC_SEVERITY}, a total
 * map over the closed code set, so two sites reporting the same code cannot
 * disagree about how loud it is. A closed list a host can enumerate but not
 * rank is knowable and not actionable.
 */
/**
 * Closed set of runtime-composition diagnostic codes. Closed because an open
 * set is a set nothing can exhaustively handle — a host that wants to escalate
 * some codes and ignore others needs to know the whole list.
 *
 * The set is the shell spec's §7.2 table and nothing else. A code that is not
 * in that table is not in this array.
 */
export declare const SURFACE_DIAGNOSTIC_CODES: readonly ["APP-ENTRY-AMBIGUOUS", "APP-ENTRY-SURFACE-UNRESOLVED", "BUNDLE-DOCUMENT-MISSING", "BUNDLE-DOCUMENT-SHAPE", "SURFACE-ENTRY-UNRESOLVED", "ROUTE-PATH-COLLISION", "ROUTE-HANDLE-AMBIGUOUS", "ROUTE-PARAM-GRAMMAR", "ROUTE-PARAM-UNDECLARED", "ROUTE-PARAM-NO-MARKER", "ROUTE-PARAM-UNSUPPLIED", "ROUTE-UNMATCHED", "EMBED-ROUTE-UNRESOLVED", "EMBED-ROUTE-CYCLE", "SLOT-TYPE-UNKNOWN", "SLOT-BINDING-INCOMPLETE", "EXPERIENCE-UNIT-UNRESOLVED", "WIDGET-UNDECLARED", "WIDGET-UNIMPLEMENTED", "WIDGET-DATA-REQUIRED-UNAVAILABLE", "WIDGET-ACTION-OUTPUT-UNDECLARED", "WIDGET-ACTION-OUTPUT-UNMAPPED", "WIDGET-ACTION-REF-UNRESOLVED", "WIDGET-ACTION-TRANSITION-AMBIGUOUS", "REGISTRY-ENTRY-NAME-COLLISION", "STATIC-CONTENT-KIND-UNKNOWN", "STATIC-IMAGE-NO-ALT", "STATIC-IMAGE-SOURCE-REFUSED", "THEME-UNCLASSIFIED-REFUSED", "THEME-DOCUMENT-ROOT-CONTAMINATED", "TRANSITION-CONDITION-UNEVALUABLE", "TRANSITION-UNFIREABLE"];
export type SurfaceDiagnosticCode = (typeof SURFACE_DIAGNOSTIC_CODES)[number];
/**
 * `error`, `warning`, `info` — shell spec §7.1. Hosts MAY elevate and MUST NOT
 * demote, which is a host rule; the shell's job is to state the floor.
 */
export type SurfaceDiagnosticSeverity = 'error' | 'warning' | 'info';
/**
 * Severity per code, exactly as the shell spec's §7.2 table fixes it.
 *
 * Total over the closed set by construction: a code added to
 * {@link SURFACE_DIAGNOSTIC_CODES} without a row here fails to compile, which is
 * the same discipline `ROUTE_CLASS_THEME_AUTHORITY` uses at its own decision
 * site. A `default` arm would let a new code arrive with an invented weight.
 */
export declare const SURFACE_DIAGNOSTIC_SEVERITY: {
    readonly 'APP-ENTRY-AMBIGUOUS': "error";
    readonly 'APP-ENTRY-SURFACE-UNRESOLVED': "error";
    readonly 'BUNDLE-DOCUMENT-MISSING': "error";
    readonly 'BUNDLE-DOCUMENT-SHAPE': "error";
    readonly 'SURFACE-ENTRY-UNRESOLVED': "error";
    readonly 'ROUTE-PATH-COLLISION': "error";
    readonly 'ROUTE-HANDLE-AMBIGUOUS': "error";
    readonly 'ROUTE-PARAM-GRAMMAR': "error";
    readonly 'ROUTE-PARAM-UNDECLARED': "error";
    readonly 'ROUTE-PARAM-NO-MARKER': "error";
    readonly 'ROUTE-PARAM-UNSUPPLIED': "error";
    readonly 'ROUTE-UNMATCHED': "warning";
    readonly 'EMBED-ROUTE-UNRESOLVED': "error";
    readonly 'EMBED-ROUTE-CYCLE': "error";
    readonly 'SLOT-TYPE-UNKNOWN': "error";
    readonly 'SLOT-BINDING-INCOMPLETE': "error";
    readonly 'EXPERIENCE-UNIT-UNRESOLVED': "error";
    readonly 'WIDGET-UNDECLARED': "error";
    readonly 'WIDGET-UNIMPLEMENTED': "error";
    readonly 'WIDGET-DATA-REQUIRED-UNAVAILABLE': "error";
    readonly 'WIDGET-ACTION-OUTPUT-UNDECLARED': "error";
    readonly 'WIDGET-ACTION-OUTPUT-UNMAPPED': "error";
    readonly 'WIDGET-ACTION-REF-UNRESOLVED': "error";
    readonly 'WIDGET-ACTION-TRANSITION-AMBIGUOUS': "error";
    readonly 'REGISTRY-ENTRY-NAME-COLLISION': "warning";
    readonly 'STATIC-CONTENT-KIND-UNKNOWN': "error";
    readonly 'STATIC-IMAGE-NO-ALT': "error";
    readonly 'STATIC-IMAGE-SOURCE-REFUSED': "error";
    readonly 'THEME-UNCLASSIFIED-REFUSED': "info";
    readonly 'THEME-DOCUMENT-ROOT-CONTAMINATED': "error";
    readonly 'TRANSITION-CONDITION-UNEVALUABLE': "warning";
    readonly 'TRANSITION-UNFIREABLE': "warning";
};
/**
 * Where a diagnostic happened, in the vocabulary of the documents rather than
 * of the renderer. A host reporting one of these back to an author needs to be
 * able to point at the artifact, not at a component tree.
 */
export interface SurfaceDiagnosticSite {
    surfaceId?: string;
    routeId?: string;
    slotId?: string;
    /** Manifest slot or document URL, when the diagnostic is about an artifact. */
    source?: string;
}
export interface SurfaceDiagnostic {
    code: SurfaceDiagnosticCode;
    /** Fixed per code by the spec's §7.2 table, never by the call site. */
    severity: SurfaceDiagnosticSeverity;
    /** One sentence, addressed to whoever can fix it. */
    message: string;
    site: SurfaceDiagnosticSite;
    details?: Readonly<Record<string, unknown>>;
}
export declare function surfaceDiagnostic(code: SurfaceDiagnosticCode, message: string, site: SurfaceDiagnosticSite, details?: Readonly<Record<string, unknown>>): SurfaceDiagnostic;
/**
 * The `THEME-DOCUMENT-ROOT-CONTAMINATED` report, from a list of property names
 * a caller read off the document root.
 *
 * The read is the caller's because the core assumes no medium (shell spec
 * §1.2); the *judgement* is here so two bindings cannot disagree about what
 * counts. Non-DOM callers never call it, which is §7.3's "does not fire in a
 * non-DOM medium".
 *
 * **This reports and never repairs.** §4.5: a shell that scrubs the root
 * manufactures the property it claims to hold, and the leak it silently fixes
 * stays broken for every consumer that is not this shell.
 */
export declare function documentRootContaminationDiagnostic(properties: readonly string[], site?: SurfaceDiagnosticSite): SurfaceDiagnostic | undefined;
