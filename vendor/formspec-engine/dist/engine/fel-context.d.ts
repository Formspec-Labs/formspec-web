/** @filedesc Schema and per-evaluation snapshot for the WASM-resident FEL context (ad-hoc reads). */
import type { FormVariable } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { EvalResult } from '../diff.js';
import type { JsonRecord } from '../interfaces.js';
import type { EngineSignal } from '../reactivity/types.js';
import type { EngineBindConfig } from './helpers.js';
/**
 * Per-Definition input to the WASM FEL context: what `dataTypes` a leaf carries (Core §2.1.3) and which
 * binds render a non-relevant read as `null`. Changes only when the Definition does.
 */
export interface FelContextSchema {
    dataTypes: Record<string, string>;
    excludedValueNull: string[];
}
/** Form-scope state of one evaluation — what the WASM context holds between ad-hoc reads. */
export interface FelContextSnapshot {
    /** Field values by instance path; repeat group arrays are ignored in favour of their flat rows. */
    values: Record<string, unknown>;
    /** Instance paths whose MIP state departs from the default (valid, relevant, optional, writable). */
    mips: {
        invalid: string[];
        nonRelevant: string[];
        readonly: string[];
        required: string[];
    };
    /** Row counts by repeat group instance path. */
    repeatCounts: Record<string, number>;
    /** Variable values by scope (`#` is form scope) and name. */
    variables: Record<string, Record<string, unknown>>;
    instances: Record<string, unknown>;
    locale?: string;
    meta?: Record<string, string | number | boolean>;
}
export declare function felContextSchema(fieldDataTypes: Record<string, string | undefined>, bindConfigs: Record<string, EngineBindConfig>): FelContextSchema;
export interface FelContextSnapshotInput {
    data: JsonRecord;
    fullResult: EvalResult | null;
    fieldSignals: Record<string, EngineSignal<any>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    repeats: Record<string, EngineSignal<number>>;
    variableDefs: FormVariable[];
    variableSignals: Record<string, EngineSignal<any>>;
    instanceData: Record<string, unknown>;
    locale?: string;
    meta?: Record<string, string | number | boolean>;
}
/**
 * The whole form's FEL state in one payload, built O(fields + rows) per evaluation. Values stay untagged —
 * the Rust context types leaves from `FelContextSchema.dataTypes` and infers money from `{amount, currency}`.
 */
export declare function felContextSnapshot(options: FelContextSnapshotInput): FelContextSnapshot;
