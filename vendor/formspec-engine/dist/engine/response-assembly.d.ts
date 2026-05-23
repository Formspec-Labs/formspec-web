/** @filedesc Response envelope, validation report, changelog migration, and pinned-definition resolution. */
import type { FormDefinition } from '@formspec-org/types';
import type { ValidationReport, ValidationResult } from '@formspec-org/types';
import type { EvalResult } from '../diff.js';
import type { AuthoredSignatureInput, PinnedResponseReference } from '../interfaces.js';
import type { EvalShapeTiming } from './wasm-fel.js';
export declare function buildFormspecResponseEnvelope(options: {
    definition: FormDefinition;
    data: Record<string, unknown>;
    report: ValidationReport | null;
    completionEligible?: boolean;
    timestamp: string;
    displayedIssuer?: {
        url: string;
        version: string;
    };
    meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        subject?: {
            id: string;
            type?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
    };
}): Record<string, unknown>;
/** Shape validations for a specific timing, from a WASM eval with the matching trigger. */
export declare function collectTimedShapeValidationResults(evalResult: EvalResult, shapeTiming: Map<string, EvalShapeTiming>, timing: EvalShapeTiming): ValidationResult[];
/** Strip optional cardinality `source`, compute counts, and wrap the spec envelope. */
export declare function buildValidationReportEnvelope(results: ValidationResult[], timestamp: string, definitionUrl?: string, definitionVersion?: string): ValidationReport;
export declare function migrateResponseData(definition: FormDefinition, responseData: Record<string, any>, fromVersion: string, options: {
    nowIso: string;
}): Record<string, any>;
export declare function resolvePinnedDefinition<T extends {
    url?: string;
    version?: string;
}>(response: PinnedResponseReference, definitions: T[]): T;
