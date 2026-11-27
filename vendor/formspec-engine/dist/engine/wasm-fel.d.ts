/** @filedesc WASM definition-eval payload, EvalResult merge, and validation merge. */
import type { EvalResult, EvalValidation } from '../diff.js';
import type { DraftExplanation } from './warning-explanations.js';
import type { ResolvedOptionListsInput, ResponseSubjectKeys } from '../interfaces.js';
/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export declare function wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: Pick<EvalResult, 'nonRelevant'> | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    resolvedOptions?: ResolvedOptionListsInput;
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    resolvedOptions?: ResolvedOptionListsInput;
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
};
export type EvalShapeTiming = 'continuous' | 'submit' | 'demand';
/** Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation. */
export declare function mergeWasmEvalWithExternalValidations(result: EvalResult, options: {
    externalValidations: EvalValidation[];
}): EvalResult;
