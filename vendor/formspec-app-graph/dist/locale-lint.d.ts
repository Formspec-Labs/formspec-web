/** @filedesc Locale spec §7 lint of each loaded Locale against its resolved target, through an injected linter. */
import type { AppGraphCrossArtifactValidator } from './types.js';
/**
 * The documents a Locale is linted against (Locale spec §7): its target
 * Definition or Screener plus the Theme and Component documents that render
 * that Definition. Key names match the engine linter's options, so a host
 * passes `lintDocument` from `@formspec-org/engine` unchanged.
 */
export interface AppGraphLocaleLintContext {
    definitionDocument?: unknown;
    screenerDocument?: unknown;
    themeDocument?: unknown;
    componentDocuments?: unknown[];
}
export interface AppGraphLintDiagnostic {
    code?: string;
    severity?: string;
    path?: string;
    message?: string;
}
/**
 * The host's document linter, injected the way schema validators are: this
 * package carries no engine. Formspec hosts pass the engine's `lintDocument`
 * (the Rust `formspec-lint` E1400–E1411 Locale checks via WASM).
 */
export type AppGraphDocumentLinter = (document: unknown, context: AppGraphLocaleLintContext) => {
    diagnostics?: readonly AppGraphLintDiagnostic[];
};
/** Diagnostics from this validator keep the Locale spec's own codes under this origin. */
export declare const LOCALE_LINT_ORIGIN: "x-formspec-lint";
/** `$.strings["a.b"][0].c` -> `/strings/a.b/0/c`; anything unparsed falls back to the root. */
export declare function lintPathToJsonPointer(path: string | undefined): string;
/**
 * Build the cross-artifact validator that runs the injected linter over every
 * loaded Locale with its resolved target. Pass it in `crossArtifactValidators`;
 * error-severity Locale findings (E1400–E1411) then fail the report.
 */
export declare function localeLintValidator(lint: AppGraphDocumentLinter): AppGraphCrossArtifactValidator;
