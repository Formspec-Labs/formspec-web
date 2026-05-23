/** @filedesc FieldViewModel — per-field reactive state with locale resolution and FEL interpolation. */
import type { OptionEntry } from '@formspec-org/types';
import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleStore } from './locale.js';
export interface FieldViewModel {
    readonly templatePath: string;
    readonly instancePath: string;
    readonly id: string;
    readonly itemKey: string;
    readonly dataType: string;
    readonly label: ReadonlyEngineSignal<string>;
    readonly hint: ReadonlyEngineSignal<string | null>;
    readonly description: ReadonlyEngineSignal<string | null>;
    readonly value: ReadonlyEngineSignal<any>;
    readonly required: ReadonlyEngineSignal<boolean>;
    readonly visible: ReadonlyEngineSignal<boolean>;
    readonly readonly: ReadonlyEngineSignal<boolean>;
    readonly disabledDisplay: 'hidden' | 'protected';
    readonly errors: ReadonlyEngineSignal<ResolvedValidationResult[]>;
    readonly firstError: ReadonlyEngineSignal<string | null>;
    readonly options: ReadonlyEngineSignal<ResolvedOption[]>;
    readonly optionsState: ReadonlyEngineSignal<{
        loading: boolean;
        error: string | null;
    }>;
    setValue(value: any): void;
}
export interface ResolvedValidationResult {
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
}
export interface ResolvedOption {
    value: string;
    label: string;
    /** Abbreviations / alternate names for combobox type-ahead (from definition option.keywords). */
    keywords?: string[];
}
export interface FieldViewModelDeps {
    rx: EngineReactiveRuntime;
    localeStore: LocaleStore;
    templatePath: string;
    instancePath: string;
    id: string;
    itemKey: string;
    dataType: string;
    getItemLabel: () => string;
    getItemHint: () => string | null;
    getItemDescription: () => string | null;
    getItemLabels: () => Record<string, string> | undefined;
    getLabelContext: () => string | null;
    getFieldValue: () => EngineSignal<any>;
    getRequired: () => EngineSignal<boolean>;
    getVisible: () => EngineSignal<boolean>;
    getReadonly: () => EngineSignal<boolean>;
    getDisabledDisplay: () => 'hidden' | 'protected';
    getErrors: () => EngineSignal<any[]>;
    getOptions: () => EngineSignal<OptionEntry[]>;
    getOptionsState: () => EngineSignal<{
        loading: boolean;
        error: string | null;
    }>;
    getOptionSetName: () => string | undefined;
    setFieldValue: (value: any) => void;
    evalFEL: (expr: string) => import('./wasm-bridge-runtime.js').FelEvalResult | unknown;
}
export declare function createFieldViewModel(deps: FieldViewModelDeps): FieldViewModel;
