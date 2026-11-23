/** @filedesc Response envelope, validation report, changelog migration, and pinned-definition resolution. */
import type { FormDefinition } from '@formspec-org/types';
import type { ValidationReport, ValidationResult } from '@formspec-org/types';
import type { EvalResult } from '../diff.js';
import type { AuthoredSignatureInput, FormEngineOptions, PinnedResponseReference } from '../interfaces.js';
import type { EvalShapeTiming } from './wasm-fel.js';
/** Emit only JSON-Schema–declared AuthoredSignature properties (additionalProperties: false). */
export declare function toNormalizedAuthoredSignatureRecord(signature: AuthoredSignatureInput, index: number, responseId: string, definitionUrl: string, definitionVersion: string, meta: {
    author?: {
        id: string;
        name?: string;
    };
} | undefined): Record<string, unknown>;
/**
 * Append whole-response signing evidence to an already emitted, completed JSON Response.
 * Preserves all other Response content and returns independent nested objects. Does not
 * emit a Response, read a clock, or verify COSE bytes, digests, identity or receipt claims.
 * Callers must provide a valid Response snapshot and provider evidence; validate the
 * resulting document against the Response schema before transport when required.
 */
export declare function attachAuthoredSignature<T extends object>(response: T, signature: AuthoredSignatureInput): T & {
    authoredSignatures: Record<string, unknown>[];
};
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
    displayedLocale?: {
        url?: string;
        version: string;
        locale: string;
    };
    subject?: FormEngineOptions['responseSubject'];
    meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
    };
}): Record<string, unknown>;
/** Keep findings visible in the report produced for evaluated response data. */
export declare function collectRelevantValidationResults(result: EvalResult, validations?: import("../diff.js").EvalValidation[]): ValidationResult[];
/** Keep refusals alongside findings for the requested Shape timing. */
export declare function collectTimedShapeValidationResults(evalResult: EvalResult, shapeTiming: Map<string, EvalShapeTiming>, timing: EvalShapeTiming): ValidationResult[];
/** Compute counts and wrap the evaluator's results in the spec report. */
export declare function buildValidationReportEnvelope(results: ValidationResult[], timestamp: string, definitionUrl?: string, definitionVersion?: string): ValidationReport;
export declare function migrateResponseData(definition: FormDefinition, responseData: Record<string, any>, fromVersion: string, options: {
    nowIso: string;
}): Record<string, any>;
export declare function resolvePinnedDefinition<T extends {
    url?: string;
    version?: string;
}>(response: PinnedResponseReference, definitions: T[]): T;
