/** @filedesc FEL/registry/lint/changelog helpers backed by tools WASM (`wasm-bridge-tools` only; ADR 0050). */
import type { ExtensionUsageIssue, FELBuiltinFunctionCatalogEntry, FELRewriteOptions, RegistryEntry, RewriteMap, SchemaValidator, SchemaValidatorSchemas } from '../interfaces.js';
export type { DocumentType, ExtensionUsageIssue, FELConditionGroupLiftResult, FELConditionBuilderOperator, FELConditionGroupCondition, FELConditionGroupLifted, FELConditionGroupUnlifted, SchemaValidationError, SchemaValidationResult, SchemaValidator, SchemaValidatorSchemas, } from '../interfaces.js';
import { wasmFindRegistryEntry, wasmGenerateChangelog, wasmLintDocument, wasmParseRegistry, wasmPrintFEL, wasmRewriteMessageTemplate, wasmTokenizeFEL, wasmTryLiftConditionGroup, wasmValidateLifecycleTransition, wasmWellKnownRegistryUrl } from '../wasm-bridge-tools.js';
export declare const tokenizeFEL: typeof wasmTokenizeFEL;
/** Rewrite FEL references using callback options (bridges to WASM rewrite). */
export declare function rewriteFELReferences(expression: string, options: FELRewriteOptions): string;
export declare const rewriteMessageTemplate: typeof wasmRewriteMessageTemplate;
export declare const lintDocument: typeof wasmLintDocument;
export declare const parseRegistry: typeof wasmParseRegistry;
export declare const findRegistryEntry: typeof wasmFindRegistryEntry;
export declare const validateLifecycleTransition: typeof wasmValidateLifecycleTransition;
export declare const wellKnownRegistryUrl: typeof wasmWellKnownRegistryUrl;
export declare const generateChangelog: typeof wasmGenerateChangelog;
export declare const printFEL: typeof wasmPrintFEL;
export declare const tryLiftConditionGroup: typeof wasmTryLiftConditionGroup;
export declare function getBuiltinFELFunctionCatalog(): FELBuiltinFunctionCatalogEntry[];
export declare function validateExtensionUsage(items: unknown[], options: {
    resolveEntry: (name: string) => RegistryEntry | undefined;
}): ExtensionUsageIssue[];
export declare function createSchemaValidator(_schemas?: SchemaValidatorSchemas): SchemaValidator;
export declare function rewriteFEL(expression: string, map: RewriteMap): string;
