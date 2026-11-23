/** @filedesc Shared lint diagnostics and URL-paired bundle document lint through an injected linter. */
import type { ProjectionConsumer } from '@formspec-org/engine';
import type { AppGraphContext, AppGraphCrossArtifactValidator, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
/** Context keys match the engine's `lintDocument` options. The host supplies the linter. */
export interface AppGraphDocumentLintContext {
    definitionDocument?: unknown;
    /** Host JSON Schema and the dotted path to the paired Definition's data within it. */
    mappingSourceContext?: {
        schema: unknown;
        dataPath: string;
    };
    screenerDocument?: unknown;
    themeDocument?: unknown;
    componentDocuments?: unknown[];
    localeDocuments?: unknown[];
    registryDocuments?: unknown[];
    /** For a projection request, all loaded Definition documents of the selected URL. */
    upstreamDefinitions?: readonly unknown[];
    /** The form and its direct instance or catalog binding, or null for a widget. */
    projectionConsumer?: ProjectionConsumer | null;
}
export interface AppGraphLintDiagnostic {
    code?: string;
    severity?: string;
    path?: string;
    message?: string;
    suggestedFix?: string;
    specRef?: string;
}
export interface AppGraphInstanceProjectionDiagnostic {
    code: string;
    jsonPointer: string;
    upstreamVersion: string | null;
    message: string;
}
/** A host injects its document linter, normally the engine's Rust/WASM `lintDocument`. */
export type AppGraphDocumentLinter = (document: unknown, context: AppGraphDocumentLintContext) => {
    diagnostics?: readonly AppGraphLintDiagnostic[];
    instanceProjectionDiagnostics?: readonly AppGraphInstanceProjectionDiagnostic[];
};
export interface AppGraphDocumentLintValidatorOptions {
    /** Resolve the host input for a loaded Mapping, or return undefined for ordinary Mapping lint. */
    resolveMappingSourceContext?: (mapping: ResolvedArtifactHandle, context: AppGraphContext) => AppGraphDocumentLintContext['mappingSourceContext'];
}
/** Lint findings keep their canonical codes under this origin. */
export declare const DOCUMENT_LINT_ORIGIN: "x-formspec-lint";
/** `$.strings["a.b"][0].c` -> `/strings/a.b/0/c`; anything unparsed falls back to the root. */
export declare function lintPathToJsonPointer(path: string | undefined): string;
/** Map lint findings once for authoring and publication consumers; each gate chooses its severity policy. */
export declare function documentLintDiagnostics(lint: AppGraphDocumentLinter, handle: ResolvedArtifactHandle, context: AppGraphDocumentLintContext): AppGraphDiagnostic[];
/** Lint every supported loaded document, even when its declared target cannot be resolved. */
export declare function documentLintValidator(lint: AppGraphDocumentLinter, { resolveMappingSourceContext }?: AppGraphDocumentLintValidatorOptions): AppGraphCrossArtifactValidator;
