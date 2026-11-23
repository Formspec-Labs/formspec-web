/** @filedesc Pairs response instances and catalog sources with upstream Definitions for Rust validation. */
import type { AppGraphDocumentLinter } from './document-lint.js';
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
export declare function requiresResponseProjectionCheck(handle: ResolvedArtifactHandle): boolean;
export declare function missingResponseProjectionChecks(handles: readonly ResolvedArtifactHandle[]): AppGraphDiagnostic[];
export declare function responseProjectionDiagnostics(lint: AppGraphDocumentLinter, context: AppGraphContext, handle: ResolvedArtifactHandle): AppGraphDiagnostic[];
