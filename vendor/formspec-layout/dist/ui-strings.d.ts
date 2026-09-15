/** @filedesc Closed renderer-chrome string inventory (Locale spec §3.1.10 `$ui.<ChromeStringKey>`) and its `{{$param}}` filler. */
/**
 * English default for every closed `$ui.<ChromeStringKey>` suffix (Locale spec §3.1.10). One entry per
 * key the schema's `ChromeStringKey` enum admits — kept one-for-one by
 * `packages/formspec-layout/tests/ui-strings.test.ts`, which reads `schemas/locale.schema.json` directly.
 * A template's `{{$name}}` placeholders are renderer-supplied literal parameters (label, index, total,
 * count, max) filled by {@link fillUiParams} — never FEL, never the form scope.
 */
export declare const UI_STRINGS: {
    readonly 'select.placeholder': "Select…";
    readonly 'select.clear': "Clear";
    readonly 'select.clearSelection': "Clear selection";
    readonly 'select.selectedValues': "Selected values";
    readonly 'select.selectAll': "Select All";
    readonly 'repeat.add': "Add {{$label}}";
    readonly 'repeat.remove': "Remove {{$label}}";
    readonly 'repeat.row': "{{$label}} {{$index}}";
    readonly 'repeat.rowOf': "{{$label}} {{$index}} of {{$total}}";
    readonly 'wizard.next': "Next";
    readonly 'wizard.nextStep': "Next step";
    readonly 'wizard.previous': "Previous";
    readonly 'wizard.previousStep': "Previous step";
    readonly 'wizard.skip': "Skip";
    readonly 'wizard.skipStep': "Skip this step";
    readonly 'wizard.submit': "Submit";
    readonly 'wizard.submitForm': "Submit form";
    readonly 'wizard.steps': "Form steps";
    readonly 'wizard.progress': "Form progress";
    readonly 'wizard.step': "Step";
    readonly 'wizard.collapseNavigation': "Collapse navigation";
    readonly 'modal.close': "Close";
    readonly 'alert.dismiss': "Dismiss";
    readonly 'validationSummary.heading': "Please correct the following";
    readonly 'date.format': "MM/DD/YYYY";
    readonly 'characterCount.limit': "You can enter up to {{$max}} characters";
    readonly 'characterCount.allowed': "{{$max}} characters allowed";
    readonly 'characterCount.left': "{{$count}} characters left";
    readonly 'characterCount.leftOne': "1 character left";
    readonly 'characterCount.over': "{{$count}} characters over limit";
    readonly 'characterCount.overOne': "1 character over limit";
    readonly 'signature.clear': "Clear";
    readonly 'signature.canvas': "Signature canvas. Use the Clear button to reset.";
    readonly 'money.amount': "Amount";
    readonly 'money.currency': "Currency code";
    readonly 'fieldHelp.label': "Help me answer this question";
    readonly 'screener.continue': "Continue";
    readonly 'screener.required': "Required";
    readonly 'screener.back': "Back to screening";
};
/** Closed suffix set for `$ui.<ChromeStringKey>` (Locale spec §3.1.10), one-for-one with the schema enum. */
export type ChromeStringKey = keyof typeof UI_STRINGS;
/**
 * Substitute `{{$name}}` in `template` with `params[name]`, literally — no FEL, no expression evaluation.
 * A placeholder with no matching param is left as-is, so a caller can partially fill a template.
 */
export declare function fillUiParams(template: string, params?: Record<string, string | number>): string;
