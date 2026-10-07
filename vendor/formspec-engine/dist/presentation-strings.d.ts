/** @filedesc Shared maintained Item and option wording cascades; no evaluator imports. */
import type { LocaleStore } from './locale.js';
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
export declare function resolveOptionLabel(localeStore: LocaleStore, itemKey: string, opt: {
    value: string;
    label: string;
}, interpolate: (template: string) => string, optionSetName?: string): {
    label: string;
    needAnchors?: string[];
};
