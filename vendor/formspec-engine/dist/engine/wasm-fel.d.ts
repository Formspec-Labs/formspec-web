/** @filedesc WASM definition-eval payload, EvalResult shaping, FEL normalization, and WasmFelContext assembly. */
import type { FormVariable } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { EvalResult, EvalValidation } from '../diff.js';
import type { WasmFelContext } from '../wasm-bridge-runtime.js';
import type { FormFieldValue, JsonRecord, JsonValue } from '../interfaces.js';
import type { EngineSignal } from '../reactivity/types.js';
import type { EngineBindConfig } from './helpers.js';
/** Subset of validation objects passed back into WASM as previous state. */
export type WasmPreviousValidation = Array<{
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
    source: string;
    shapeId?: string;
    context?: Record<string, unknown>;
}>;
/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export declare function wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: EvalResult | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    /** Authoritative repeat row counts by group base path (matches engine repeat signals). */
    repeatCounts: Record<string, number>;
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousValidations: WasmPreviousValidation | undefined;
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    repeatCounts: Record<string, number>;
};
export type EvalShapeTiming = 'continuous' | 'submit' | 'demand';
/** Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation. */
export declare function mergeWasmEvalWithExternalValidations(result: EvalResult, options: {
    externalValidations: EvalValidation[];
}): EvalResult;
export declare function normalizeExpressionForWasmEvaluation(options: {
    expression: string;
    currentItemPath: string;
    replaceSelfRef: boolean;
    repeats: Record<string, EngineSignal<number>>;
    fieldSignals: Record<string, EngineSignal<any>>;
}): string;
export declare function resolveFelFieldValueForWasm(path: string, value: unknown, bindConfigs: Record<string, EngineBindConfig>, fieldIsIrrelevant: (path: string) => boolean): FormFieldValue;
export declare function visibleScopedVariableValues(scopePath: string, variableDefs: FormVariable[], variableSignals: Record<string, EngineSignal<any>>, overrides?: Record<string, any>): Record<string, any>;
/** Per-call memo for repeat collections and outer-group snapshots, shared by every scope of one context base. */
export interface FelRepeatContextCache {
    collections: Map<string, JsonValue[]>;
    groupSnapshots: Map<string, JsonRecord>;
}
export declare function buildFelRepeatWasmContext(options: {
    currentItemPath: string;
    repeats: Record<string, EngineSignal<number>>;
    fieldSignals: Record<string, EngineSignal<any>>;
    fieldDataTypes: Record<string, string | undefined>;
    cache?: FelRepeatContextCache;
}): WasmFelContext['repeatContext'] | undefined;
/**
 * Lexical scopes enclosing `currentItemPath`, outermost first (Core §3.2.1). A group or repeat-row path
 * (`jobs[0]`, `jobs[0].address`) is its own innermost scope, so a component `when` on a row sees the row's
 * fields as `$sibling`; a field path's innermost scope is its parent, matching Rust bind evaluation.
 */
export declare function lexicalScopeChain(currentItemPath: string, fieldDataTypes: Record<string, string | undefined>): string[];
export interface WasmFelContextBuildInput {
    currentItemPath: string;
    data: Record<string, any>;
    fullResult: EvalResult | null;
    resultOverride?: EvalResult | null;
    dataOverride?: Record<string, any>;
    scopedVariableOverrides?: Record<string, any>;
    fieldSignals: Record<string, EngineSignal<any>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    repeats: Record<string, EngineSignal<number>>;
    bindConfigs: Record<string, EngineBindConfig>;
    fieldDataTypes: Record<string, string | undefined>;
    variableDefs: FormVariable[];
    variableSignals: Record<string, EngineSignal<any>>;
    instanceData: Record<string, unknown>;
    nowIso: string;
    locale?: string;
    meta?: Record<string, string | number | boolean>;
}
/**
 * One-shot FEL context for `currentItemPath`: the form-scope base plus each enclosing lexical scope's names,
 * outermost first so the nearest scope shadows (Core §3.2.1). O(fields × scope depth), so it serves the
 * in-flight evaluation reads that must see partial state. Ad-hoc reads go through the WASM-resident
 * `FelContext` handle instead (`FormEngine.felContext`).
 */
export declare function buildWasmFelExpressionContext(options: WasmFelContextBuildInput): WasmFelContext;
