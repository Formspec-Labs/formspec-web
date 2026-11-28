import type { FormDefinition, FormResponse, ResponseSelectionDelivery } from '@formspec-org/types';
/** Parsed JSON from `fel_analysis_to_json_value` (Rust) — pass through to {@link normalizeFelAnalysisError}. */
export type WasmFelAnalysisResultJson = {
    valid: boolean;
    errors: Array<string | {
        message: string;
        span?: {
            start: number;
            end: number;
        } | null;
    }>;
    warnings: string[];
    references: string[];
    variables: string[];
    functions: string[];
};
export type WasmModule = typeof import('../wasm-pkg-runtime/formspec_wasm_runtime.js');
/** Whether the WASM module has been initialized and is ready for use. */
export declare function isWasmReady(): boolean;
/** How the host supplies the WASM module. */
export interface InitWasmOptions {
    /**
     * The runtime `.wasm` bytes, for a host that cannot fetch the sibling asset (a self-contained page,
     * a sandbox with no network). Used in place of the Node file read and the browser fetch.
     */
    wasmBytes?: BufferSource;
}
/**
 * Initialize the WASM module. Safe to call multiple times — subsequent calls
 * return the same promise. Resolves when WASM is ready; rejects on failure.
 *
 * With `wasmBytes`, instantiates from those bytes.
 * In Node.js, otherwise uses `initSync()` with bytes read from disk.
 * In browsers, otherwise the generated wasm-bindgen loader fetches the sibling `.wasm` asset via URL.
 */
export declare function initWasm(options?: InitWasmOptions): Promise<void>;
/**
 * Initialized runtime module — for `wasm-bridge-tools` only (ABI check).
 * Not re-exported from the public `wasm-bridge` barrel.
 */
export declare function getWasmModule(): WasmModule;
/** In-band result from `evalFEL` / `evalFELWithContext` (Locale §3.3.1 rule 2). */
export interface FelEvalResult {
    value: unknown;
    hasErrorDiagnostics: boolean;
}
/** Evaluate a FEL expression with optional field values. Returns the evaluated value. */
export declare function wasmEvalFel(expression: string, fields?: Record<string, any>): any;
/** FEL evaluation context for the richer WASM evaluator. */
export interface WasmFelContext {
    fields: Record<string, any>;
    variables?: Record<string, any>;
    mipStates?: Record<string, {
        valid?: boolean;
        relevant?: boolean;
        readonly?: boolean;
        required?: boolean;
    }>;
    repeatContext?: {
        current: any;
        index: number;
        count: number;
        collection?: any[];
        parent?: WasmFelContext['repeatContext'];
    };
    instances?: Record<string, any>;
    nowIso?: string;
    /** Active locale code (BCP 47) — backs `locale()` and default for `pluralCategory()`. */
    locale?: string;
    /** The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4). */
    dateFormats?: Record<string, string>;
    /** Runtime metadata bag — backs `runtimeMeta(key)`. */
    meta?: Record<string, string | number | boolean>;
}
/** Evaluate a FEL expression with full FormspecEnvironment context (value + diagnostics flag). */
export declare function wasmEvalFelWithContextEnvelope(expression: string, context: WasmFelContext, extensions?: FelExtensionHost): FelEvalResult;
/** Host extension functions (Core §3.12) handed to evaluating exports; Rust calls `arity` and `invoke`. */
export type FelExtensionHost = import('../wasm-pkg-runtime/formspec_wasm_runtime.js').FelExtensionHost;
/** Throws when `name` may not be an extension function: a FEL built-in or reserved word (Core §3.12). */
export declare function wasmCheckFelExtensionName(name: string): void;
/**
 * A single recorded event during FEL evaluation.
 *
 * Mirrors `fel_core::TraceStep` verbatim — the `kind` discriminant is the
 * PascalCase Rust variant name. Extend this union only when the Rust enum
 * grows a new variant; every variant here must exist in Rust.
 */
export type FelTraceStep = {
    /** A `$field` reference was resolved against the environment. */
    kind: 'FieldResolved';
    /** Dotted path as written in source (e.g. `foo`, `items[2].amount`). */
    path: string;
    /** Value returned by the environment, projected to JSON. */
    value: unknown;
} | {
    /** A function call completed and returned a value. */
    kind: 'FunctionCalled';
    /** Function name as written in source. */
    name: string;
    /** Argument values, in order. */
    args: unknown[];
    /** Return value. */
    result: unknown;
} | {
    /** A binary operator produced a result from two operand values. */
    kind: 'BinaryOp';
    /** Operator symbol (`+`, `==`, `and`, ...). */
    op: string;
    /** Left-hand value. */
    lhs: unknown;
    /** Right-hand value. */
    rhs: unknown;
    /** Result value. */
    result: unknown;
} | {
    /** A conditional selected a branch. */
    kind: 'IfBranch';
    /** The evaluated condition value. */
    condition_value: unknown;
    /** Which branch was taken: `"then"` or `"else"`. */
    branch_taken: 'then' | 'else';
} | {
    /** A logical operator short-circuited; the right-hand side was not evaluated. */
    kind: 'ShortCircuit';
    /** Operator symbol (`and` or `or`). */
    op: string;
    /** Human-readable reason. */
    reason: string;
};
/** Result of a traced FEL evaluation. */
export interface FelTraceResult {
    /** Evaluated value (JSON-projected — no FEL type tags). */
    value: unknown;
    /** True when error-severity diagnostics were recorded (Locale §3.3.1 rule 2). */
    hasErrorDiagnostics: boolean;
    /** Diagnostics emitted during evaluation. */
    diagnostics: Array<Record<string, unknown>>;
    /** Ordered trace steps, appended in evaluation order. */
    trace: FelTraceStep[];
}
/**
 * Evaluate a FEL expression with a structured trace of evaluation steps.
 *
 * Opt-in tracing path — use when surfacing evaluation to humans or LLMs
 * (MCP tools, error explainers). Values in the trace are projected to JSON,
 * losing FEL type fidelity (money/date) but gaining universal readability.
 */
export declare function wasmEvalFelWithTrace(expression: string, fields?: Record<string, unknown>): FelTraceResult;
/** Evaluate a FEL expression against full FormspecEnvironment context and trace each step. */
export declare function wasmEvalFelWithContextTrace(expression: string, context: WasmFelContext, extensions?: FelExtensionHost): FelTraceResult;
/** Interpolation result from Rust: resolved text plus one warning per expression left literal. */
export interface WasmInterpolated {
    text: string;
    warnings: Array<{
        expression: string;
        message: string;
    }>;
}
/** Locale §3.3.1: resolve every `{{expression}}` in `template` against a FEL context, in one call. */
export declare function wasmInterpolateFelTemplate(template: string, context: WasmFelContext, extensions?: FelExtensionHost): WasmInterpolated;
/**
 * Locale §3.3.1 with a host evaluator: Rust scans the template and applies the escape, failure,
 * and coercion rules; `evaluate(expression)` returns JSON `{ value, hasErrorDiagnostics? }` or throws.
 */
export declare function wasmInterpolateTemplate(template: string, evaluate: (expression: string) => string): WasmInterpolated;
/**
 * One form's FEL state, resident in WASM across ad-hoc reads.
 *
 * `load` replaces the form-scope snapshot; each read names only its expression and Item path, so its cost is
 * the scope it resolves against, not the size of the form. Call `free()` when the owning engine is disposed.
 */
export type WasmFelContextHandle = import('../wasm-pkg-runtime/formspec_wasm_runtime.js').FelContext;
/** Creates a resident FEL context from a Definition's leaf typing and `excludedValue: "null"` binds. */
export declare function wasmCreateFelContext(schema: {
    itemPaths?: string[];
    dataTypes: Record<string, string>;
    excludedValueNull: string[];
}): WasmFelContextHandle;
/** Inline `optionSet` references from `optionSets` on a definition JSON document. */
export declare function wasmResolveOptionSetsOnDefinition(definitionJson: string): string;
/** Apply `migrations` on a definition to flat response data (FEL transforms in Rust). */
export declare function wasmApplyMigrationsToResponseData(definitionJson: string, responseDataJson: string, fromVersion: string, nowIso: string): string;
/** Coerce an inbound field value (whitespace, numeric strings, money, precision). */
export declare function wasmCoerceFieldValue(itemJson: string, bindJson: string, definitionJson: string, valueJson: string): string;
/** Canonicalize Response `data` against a Definition's declared fields and authored Binds. */
export declare function wasmCanonicalizeResponseData<T = import('./interfaces.js').JsonRecord>(definition: unknown, data: T): T;
/** Static FEL reads from Rust, with paths relative to each named instance. */
export interface FELDependencies {
    fields: string[];
    contextRefs: string[];
    /** Known instance names and their sorted paths, with an empty path for a whole-instance read. */
    instanceReads: Record<string, string[]>;
    /** Paths relative to the current field, with an empty path for the field itself. */
    selfReads: string[];
    mipDeps: string[];
    hasSelfRef: boolean;
    hasWildcard: boolean;
    usesPrevNext: boolean;
}
export declare function wasmGetFelDependencies(expression: string): FELDependencies;
/** Normalize a dotted path by stripping repeat indices. */
export declare function wasmNormalizeIndexedPath(path: string): string;
/** Resolve an item in a nested item tree by dotted path. */
export declare function wasmItemAtPath<T = any>(items: unknown[], path: string): T | undefined;
/** Resolve an item's parent path, index, and value in a nested item tree. */
export declare function wasmItemLocationAtPath<T = any>(items: unknown[], path: string): {
    parentPath: string;
    index: number;
    item: T;
} | undefined;
/** Sources and Response context available during creation. */
export interface WasmCreateOptions {
    nowIso?: string;
    instances?: Record<string, unknown>;
    pendingInstances?: string[];
    pendingPaths?: string[];
    subjectType?: string | null;
    subjectKeys?: import('./interfaces.js').ResponseSubjectKeys;
}
export interface WasmCreation {
    refused: boolean;
    data: import('./interfaces.js').JsonRecord;
    pending: string[];
    diagnostics: Array<import('./diff.js').EvalDiagnostic & {
        code: string;
    }>;
}
/** Assemble the Response instance and explanation evidence before the candidate is signed. */
export declare function wasmAssembleCandidate(definition: FormDefinition, response: FormResponse, resolution: Readonly<Record<string, ResponseSelectionDelivery>>, evaluation?: {
    candidateExplanations?: import('./engine/warning-explanations.js').DraftExplanation[];
} | null): FormResponse;
/**
 * Derive Core's subject id (`Response.subject.id`) from a subject type and exact typed keys.
 * Throws for untyped keys or an integer outside the I-JSON range.
 */
export declare function wasmResponseSubjectId(subjectType: string, keys: import('./interfaces.js').ResponseSubjectKeys): string;
/** Apply creation-time values to a new Response or resolve its pending values. */
export declare function wasmCreateResponse(definition: unknown, data: Record<string, unknown>, context?: WasmCreateOptions, extensions?: FelExtensionHost): WasmCreation;
/** Create a new row at the end of the given repeat. */
export declare function wasmCreateRepeatRow(definition: unknown, data: Record<string, unknown>, groupPath: string, context?: WasmCreateOptions, extensions?: FelExtensionHost): WasmCreation | null;
type WasmEvaluationContext = {
    nowIso?: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousNonRelevant?: string[];
    instances?: Record<string, unknown>;
    explanations?: import('./engine/warning-explanations.js').DraftExplanation[];
    registryDocuments?: unknown[];
    /** Host-supplied resolved option lists for remote `optionSets` and URI-string `Item.options`. */
    resolvedOptions?: import('./interfaces.js').ResolvedOptionListsInput;
    /** The current Response's subject type. Null means a subject was supplied without a type. */
    subjectType?: string | null;
    /** The current Response's subject keys, available to `subject(key)`. */
    subjectKeys?: import('./interfaces.js').ResponseSubjectKeys;
    /** Ask for resolved Item text (Core §4.2.1); `localeStrings` are cascade-resolved Locale strings. */
    itemText?: {
        localeStrings?: Record<string, string>;
    };
};
type WasmEvaluation = {
    /** The Definition or inputs were refused before Recalculate. */
    refused: boolean;
    /** Flat state keyed by path (`group.field`, `rows[0].name`), like `required` and `readonly`. */
    values: any;
    /** The Response projection of `values` after `nonRelevantBehavior`: groups are objects, repeats are arrays of row objects. */
    data: any;
    /** Sorted Response `data` instance paths present in the input that no Definition Item declares. */
    undeclaredDataPaths: string[];
    validations: any[];
    explanationFindings?: import('./engine/warning-explanations.js').ExplanationFinding[];
    candidateExplanations?: import('./engine/warning-explanations.js').DraftExplanation[];
    diagnostics: import('./diff.js').EvalDiagnostic[];
    nonRelevant: string[];
    heldNonRelevantValues?: Record<string, unknown>;
    variables: any;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
    /**
     * Resolved Item text by instance path; present only when `context.itemText` asked for it.
     *
     * `label` / `description` / `hint` are the context-less resolutions; `labels` / `descriptions` /
     * `hints` carry the per-display-context ones (Locale §3.1.2), each omitted when empty.
     */
    itemText?: Record<string, {
        label: string;
        labels?: Record<string, string>;
        description?: string;
        descriptions?: Record<string, string>;
        hint?: string;
        hints?: Record<string, string>;
    }>;
};
/** Evaluate a Formspec definition against provided data. */
export declare function wasmEvaluateDefinition(definition: unknown, data: Record<string, unknown>, context?: WasmEvaluationContext, extensions?: FelExtensionHost): WasmEvaluation;
/** Prepare stable Response data and its submit verdict. Throws if the data do not converge. */
export declare function wasmEvaluateFiled(definition: unknown, data: Record<string, unknown>, context?: WasmEvaluationContext, extensions?: FelExtensionHost): WasmEvaluation;
/**
 * Evaluate a standalone Screener Document against respondent inputs.
 * Returns a Determination Record (always non-null).
 *
 * `extensions` resolves host extension functions (Core §3.12) in route `condition` / `score` and
 * phase `activeWhen`; without them such a call is a definition error and the route is eliminated.
 */
export declare function wasmEvaluateScreenerDocument(screener: unknown, answers: Record<string, unknown>, context?: Record<string, unknown>, extensions?: FelExtensionHost): import('@formspec-org/types').DeterminationRecord;
/** Analyze a FEL expression and return structural info. */
export declare function wasmAnalyzeFel(expression: string): WasmFelAnalysisResultJson;
/** Analyze a FEL expression with field data type context for type-mismatch warnings. */
export declare function wasmAnalyzeFelWithFieldTypes(expression: string, fieldTypes: Record<string, string>): WasmFelAnalysisResultJson;
/** Check if a string is a valid FEL identifier. */
export declare function wasmIsValidFelIdentifier(s: string): boolean;
/** Sanitize a string into a valid FEL identifier. */
export declare function wasmSanitizeFelIdentifier(s: string): string;
/** Execute a MappingRule[] array against source in runtime WASM. */
export declare function wasmExecuteMappingRuntime(rules: unknown[], source: unknown, direction: 'forward' | 'reverse'): {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
};
/**
 * Execute a Mapping Document in runtime WASM (without loading tools WASM).
 * Documents with an external `sourceSchema` require tools WASM for JSON Schema validation.
 */
export declare function wasmExecuteMappingDocRuntime(doc: unknown, source: unknown, direction: 'forward' | 'reverse'): {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
};
/** Compute dependency groups from recorded changeset entries (JSON round-trip to Rust). */
export declare function wasmComputeDependencyGroups(entriesJson: string): Array<{
    entries: number[];
    reason: string;
}>;
export {};
