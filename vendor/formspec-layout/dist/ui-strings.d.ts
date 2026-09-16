/** @filedesc Closed renderer-chrome string inventory (Locale spec §3.1.10 `$ui.<ChromeStringKey>`) and its `{{$param}}` filler. */
/**
 * English default for every closed `$ui.<ChromeStringKey>` suffix (Locale spec §3.1.10). One entry per
 * key the schema's `ChromeStringKey` enum admits — kept one-for-one by
 * `packages/formspec-layout/tests/ui-strings.test.ts`, which reads `schemas/locale.schema.json` directly.
 * A template's `{{$name}}` placeholders are renderer-supplied literal parameters (label, index, total,
 * count, max, status, reason, message) filled by {@link fillUiParams} — never FEL, never the form scope.
 */
export declare const UI_STRINGS: {
    readonly 'select.placeholder': "Select…";
    readonly 'select.clearSelection': "Clear selection";
    readonly 'select.selectedValues': "Selected values";
    readonly 'select.selectAll': "Select All";
    readonly 'repeat.add': "Add {{$label}}";
    readonly 'repeat.remove': "Remove {{$label}}";
    readonly 'repeat.row': "{{$label}} {{$index}}";
    readonly 'repeat.rowOf': "{{$label}} {{$index}} of {{$total}}";
    readonly 'repeat.rowNamed': "{{$label}} of {{$total}}";
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
    readonly 'wizard.otherItems': "Additional items";
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
    readonly 'dataTable.addRow': "Add Row";
    readonly 'dataTable.remove': "Remove";
    readonly 'dataTable.removeRow': "Remove row {{$index}}";
    readonly 'dataTable.actions': "Actions";
    readonly 'wizard.stepTitle': "Step {{$index}}";
    readonly 'wizard.stepStatus': "Step {{$index}} of {{$total}}: {{$title}}";
    readonly 'wizard.finalStepStatus': "Step {{$index}} of {{$total}}: {{$title}} — final step";
    readonly 'wizard.stepAnnouncement': "{{$title}}. Step {{$index}} of {{$total}}.";
    readonly 'wizard.finalStepAnnouncement': "{{$title}}. Next will submit the form.";
    readonly 'wizard.expandNavigation': "Expand navigation";
    readonly 'select.loadingOptions': "Loading options...";
    readonly 'select.remoteFallback': "Remote options unavailable; using fallback options.";
    readonly 'select.remoteFailed': "Failed to load options.";
    readonly 'modal.open': "Open";
    readonly 'fileUpload.dropzone': "Drop files here or click to browse";
    readonly 'fileUpload.dropzoneKeyboard': "Drop files here or press Enter to browse";
    readonly 'fileUpload.browse': "Upload a file";
    readonly 'validationSummary.fixOne': "Please fix this error before continuing:";
    readonly 'validationSummary.fixMany': "Please fix these {{$count}} errors before continuing:";
    readonly 'validationSummary.reviewOne': "Please review this warning before continuing:";
    readonly 'validationSummary.reviewMany': "Please review these {{$count}} warnings before continuing:";
    readonly 'validationSummary.review': "Please review the following before continuing:";
    readonly 'validationSummary.errorCountOne': "There is 1 error on this form.";
    readonly 'validationSummary.errorCount': "There are {{$count}} errors on this form.";
    readonly 'validationSummary.issueCountOne': "There is 1 issue to review on this form.";
    readonly 'validationSummary.issueCount': "There are {{$count}} issues to review on this form.";
    readonly 'validationSummary.row': "{{$label}}: {{$message}}";
    readonly 'action.submit': "Submit";
    readonly 'action.inProgress': "In progress.";
    readonly 'action.completed': "Completed";
    readonly 'action.blocked': "Blocked";
    readonly 'action.failed': "Failed";
    readonly 'action.deferred': "Deferred";
    readonly 'action.unresolved': "Unresolved";
    readonly 'action.status': "{{$status}}.";
    readonly 'action.statusReason': "{{$status}}: {{$reason}}";
    readonly 'screener.submit': "Check Eligibility";
    readonly 'screener.answerOne': "Please answer at least one question";
    readonly 'assist.filled': "{{$label}} filled by your assistant";
};
/** Closed suffix set for `$ui.<ChromeStringKey>` (Locale spec §3.1.10), one-for-one with the schema enum. */
export type ChromeStringKey = keyof typeof UI_STRINGS;
/**
 * Substitute `{{$name}}` in `template` with `params[name]`, literally — no FEL, no expression evaluation.
 * A placeholder with no matching param is left as-is, so a caller can partially fill a template.
 */
export declare function fillUiParams(template: string, params?: Record<string, string | number>): string;
