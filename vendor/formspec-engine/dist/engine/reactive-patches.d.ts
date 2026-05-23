/** @filedesc Apply WASM/diff outputs to `EngineSignal` stores — reactive seam only. */
import type { EvalDelta } from '../diff.js';
import type { EngineReactiveRuntime, EngineSignal } from '../reactivity/types.js';
import type { ValidationResult } from '@formspec-org/types';
import type { FormItem } from '@formspec-org/types';
import type { EngineBindConfig } from './helpers.js';
export declare function patchValueSignalsFromWasm(options: {
    values: Record<string, unknown>;
    signals: Record<string, EngineSignal<any>>;
    data: Record<string, any>;
    fieldItems: Map<string, FormItem>;
    bindConfigs: Record<string, EngineBindConfig>;
    calculatedFields: Set<string>;
}): void;
export declare function patchDeltaSignalsFromWasm(rx: EngineReactiveRuntime, delta: EvalDelta, options: {
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
    variableSignals: Record<string, EngineSignal<any>>;
    variableSignalKeys: Map<string, string[]>;
    prePopulateReadonly: Set<string>;
}): void;
export declare function patchErrorSignalsFromWasm(rx: EngineReactiveRuntime, options: {
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
}): void;
