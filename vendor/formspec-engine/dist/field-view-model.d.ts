/** @filedesc FieldViewModel — per-field reactive state with locale resolution and FEL interpolation. */
import type { OptionEntry } from '@formspec-org/types';
import type { SetValueOptions, WriteSource } from './interfaces.js';
import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleStore } from './locale.js';
export interface FieldViewModel {
    readonly templatePath: string;
    readonly instancePath: string;
    readonly id: string;
    readonly itemKey: string;
    readonly dataType: string;
    readonly label: ReadonlyEngineSignal<string>;
    readonly labelNeedAnchors: ReadonlyEngineSignal<string[]>;
    readonly hint: ReadonlyEngineSignal<string | null>;
    readonly hintNeedAnchors: ReadonlyEngineSignal<string[]>;
    readonly description: ReadonlyEngineSignal<string | null>;
    readonly descriptionNeedAnchors: ReadonlyEngineSignal<string[]>;
    readonly labelTemplate: ReadonlyEngineSignal<string>;
    readonly hintTemplate: ReadonlyEngineSignal<string | null>;
    readonly descriptionTemplate: ReadonlyEngineSignal<string | null>;
    /** Resolve `{{expression}}` in this field's binding scope (Locale §3.3.1). */
    interpolate(template: string): string;
    readonly value: ReadonlyEngineSignal<any>;
    readonly required: ReadonlyEngineSignal<boolean>;
    readonly visible: ReadonlyEngineSignal<boolean>;
    readonly readonly: ReadonlyEngineSignal<boolean>;
    readonly disabledDisplay: 'hidden' | 'protected';
    readonly errors: ReadonlyEngineSignal<ResolvedValidationResult[]>;
    readonly firstError: ReadonlyEngineSignal<string | null>;
    /**
     * The message a respondent reads for one of this field's validation results, through the Locale
     * validation-message cascade — what `errors` shows, for a result from any report (a submit, a summary).
     */
    resolveMessage(result: {
        code?: string;
        constraintKind?: string;
        message?: string;
    }): string;
    readonly options: ReadonlyEngineSignal<ResolvedOption[]>;
    readonly optionsState: ReadonlyEngineSignal<{
        loading: boolean;
        error: string | null;
    }>;
    setValue(value: any, options?: SetValueOptions): void;
    /** Who last wrote this field; null until written. */
    readonly writeSource: ReadonlyEngineSignal<WriteSource | null>;
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
    /** Canonical Need anchors copied from the exact authored option label. */
    needAnchors?: string[];
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
    /** The Bind's inline `constraintMessage` template for this field, before `{{}}` resolution. */
    getConstraintMessage: () => string | null;
    getOptions: () => EngineSignal<OptionEntry[]>;
    getOptionsState: () => EngineSignal<{
        loading: boolean;
        error: string | null;
    }>;
    getOptionSetName: () => string | undefined;
    setFieldValue: (value: any, options?: SetValueOptions) => void;
    getWriteSource: () => EngineSignal<WriteSource | null>;
    /** Resolves `{{expression}}` in the field's binding scope (Locale §3.3.1). */
    interpolate: (template: string) => string;
    /** {@link FieldViewModelDeps.interpolate} with bare `$` bound to the field, as in its Bind: validation messages. */
    interpolateMessage: (template: string) => string;
}
export interface ResolvedPresentationString<T extends string | null> {
    value: T;
    /** The winning string before `{{}}` interpolation — what the author wrote. */
    template: T;
    needAnchors: string[];
}
/** Inputs to the Item label cascade; read inside a computed so every getter is a dependency. */
export interface ItemLabelSource {
    localeStore: LocaleStore;
    itemKey: string;
    inlineLabel: string | undefined;
    labels: Record<string, string> | undefined;
    context: string | null;
    /** Resolves `{{expression}}` in the Item's binding scope (Locale §3.3.1). */
    interpolate: (template: string) => string;
}
/** Inputs to the Item hint / description cascade, read inside a computed like {@link ItemLabelSource}. */
export interface ItemHelpTextSource {
    localeStore: LocaleStore;
    itemKey: string;
    /** Which help-text property to resolve. */
    property: 'hint' | 'description';
    /** The Definition's inline `hint` / `description`, when it has one. */
    inlineText: string | null | undefined;
    context: string | null;
    /** Resolves `{{expression}}` in the Item's binding scope (Locale §3.3.1). */
    interpolate: (template: string) => string;
}
/**
 * Hint or description a respondent sees for any Item (Core §4.2.1, Locale §3.1.2): Locale
 * `<key>.<property>@context` → Locale `<key>.<property>` → the inline property — the label cascade
 * minus its Definition-side context step, since neither property has a `labels`-like sibling.
 * `null` when no source has it.
 */
export declare function resolveItemHelpText(source: ItemHelpTextSource): ResolvedPresentationString<string | null>;
/**
 * Label a respondent sees for any Item (Locale §3.1–3.3): Locale `<key>.label@context` → Locale
 * `<key>.label` → Definition `labels[context]` → inline `label`, `{{}}` resolved through `interpolate`.
 */
export declare function resolveItemLabel(source: ItemLabelSource): ResolvedPresentationString<string>;
export declare function createFieldViewModel(deps: FieldViewModelDeps): FieldViewModel;
