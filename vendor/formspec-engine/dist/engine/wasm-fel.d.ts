/** @filedesc WASM definition-eval payload, EvalResult merge, and validation merge. */
import type { EvalResult, EvalValidation } from '../diff.js';
import type { ResponseSubjectKeys } from '../interfaces.js';
/** Subset of validation objects passed back into WASM as previous state. */
export type WasmPreviousValidation = Array<{
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
    source?: string;
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
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    /** Authoritative repeat row counts by group base path (matches engine repeat signals). */
    repeatCounts: Record<string, number>;
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousValidations: WasmPreviousValidation | undefined;
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    repeatCounts: Record<string, number>;
};
export type EvalShapeTiming = 'continuous' | 'submit' | 'demand';
/** Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation. */
export declare function mergeWasmEvalWithExternalValidations(result: EvalResult, options: {
    externalValidations: EvalValidation[];
}): EvalResult;
