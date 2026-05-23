/**
 * @filedesc Response Actions FEL host-binding catalog (§4.1 precondition + §6.4 effect-time).
 *
 * Spec §4.1 publishes a CLOSED catalog of six bindings for FEL precondition
 * expressions; §6.4 extends that set for effect-time expressions
 * (`payloadRef`, `detailRef`). FEL evaluators MUST reject unregistered
 * `@name` bindings. fel-core ships the `ContextBindingCatalog` Rust trait
 * + `EmptyCatalog` + the "unbound context reference" diagnostic
 * (fel-core/src/evaluator/core.rs); the WASM bridge does not yet surface a
 * way for the host to install a catalog into the evaluator.
 *
 * Until that bridge ships, this module publishes the catalog object as the
 * formspec-layer contract surface: a runtime structure host evaluators MUST
 * honor and a static validator that hosts (and the engine's default
 * precondition path) can run against any candidate FEL expression to detect
 * unregistered `@names` before evaluation. Host-supplied `ports.evaluatePrecondition`
 * remains the fallback when full FEL evaluation is needed; the catalog is the
 * contract these evaluators MUST conform to.
 */
/** Six fields every FEL §6.3.1 catalog entry must publish. */
export interface PreconditionCatalogEntry {
    /** Binding name (the part after `@`). */
    name: string;
    /** Binding kind per FEL §6.3.1 (`value`, `object`, `function`). */
    kind: 'value' | 'object' | 'function';
    /** Human-readable type description. */
    type: string;
    /** Purity per FEL §6.3.1 — `pure` or `impure`. */
    purity: 'pure' | 'impure';
    /** Evaluation timing — `eager` or `lazy`. */
    evaluationTiming: 'eager' | 'lazy';
    /** Scope — typically `expression`. */
    scope: 'expression' | 'statement';
}
/**
 * Closed §4.1 catalog for FEL precondition expressions. Names + shapes mirror
 * specs/response-actions/response-actions-spec.md §4.1. Authors MUST NOT
 * extend this set; processors MUST reject unregistered `@name` bindings.
 */
export declare const RESPONSE_ACTIONS_PRECONDITION_BINDINGS: readonly PreconditionCatalogEntry[];
/**
 * §6.4 effect-time catalog. Extends §4.1 with `@effects` and republishes
 * `@invocation` with `attempt` available. Authors MUST NOT extend; evaluators
 * MUST reject unregistered `@name` bindings in `payloadRef` / `detailRef`.
 */
export declare const RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS: readonly PreconditionCatalogEntry[];
/** Outcome of a catalog-validation check. */
export interface CatalogValidationResult {
    /** True when every `@name` referenced in the expression is in the catalog. */
    ok: boolean;
    /** Sorted unique list of unregistered `@name` references. */
    unbound: string[];
}
/**
 * Catalog-aware FEL precondition validator. Host evaluators MUST honor this
 * catalog when evaluating preconditions; the engine's default precondition
 * path SHOULD consult this validator before delegating to FEL evaluation.
 *
 * The catalog object is the contract surface. Until the fel-wasm bridge
 * exposes ContextBindingCatalog wiring, host-supplied
 * `ports.evaluatePrecondition` is the fallback for actual FEL evaluation,
 * but unregistered `@name` references MUST be rejected even before then.
 */
export declare class ResponseActionsPreconditionCatalog {
    private readonly published;
    /** Catalog entries, exposed for tooling/introspection. */
    readonly entries: readonly PreconditionCatalogEntry[];
    constructor(entries?: readonly PreconditionCatalogEntry[]);
    /** Returns true when `name` (without `@`) is in the catalog. */
    isBindingPublished(name: string): boolean;
    /**
     * Extracts every `@name` reference in `expression` and asserts each is
     * published. Returns `{ ok: false, unbound: […] }` when one or more
     * names are not registered. The check is lexical, not semantic — a
     * fully FEL-aware evaluator built on fel-core's `ContextBindingCatalog`
     * remains the eventual authoritative implementation.
     */
    validateExpression(expression: string): CatalogValidationResult;
}
