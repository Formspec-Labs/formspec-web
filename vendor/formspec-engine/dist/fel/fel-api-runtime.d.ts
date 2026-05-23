/** @filedesc Path helpers and runtime-WASM FEL surface (`wasm-bridge-runtime` only; ADR 0050). */
import type { FELAnalysis } from '../interfaces.js';
export type { FELAnalysis } from '../interfaces.js';
import { wasmComputeDependencyGroups, wasmEvalFELWithTrace, wasmEvaluateDefinition, wasmIsValidFelIdentifier, wasmItemAtPath, wasmNormalizeIndexedPath, wasmSanitizeFelIdentifier } from '../wasm-bridge-runtime.js';
export type { FelTraceStep, FelTraceResult } from '../wasm-bridge-runtime.js';
import { lineColumnAtCharOffset, normalizeFelAnalysisError, type WasmFelAnalysisErrorWire } from './normalize-fel-analysis-error.js';
export { lineColumnAtCharOffset, normalizeFelAnalysisError, type WasmFelAnalysisErrorWire };
export declare const normalizeIndexedPath: typeof wasmNormalizeIndexedPath;
export declare const itemAtPath: typeof wasmItemAtPath;
export declare function analyzeFEL(expression: string): FELAnalysis;
/** Analyze a FEL expression with field data type context for type-mismatch warnings. */
export declare function analyzeFELWithFieldTypes(expression: string, fieldTypes: Record<string, string>): FELAnalysis;
/** Basic tree item shape used by path traversal helpers. */
export interface TreeItemLike<T extends TreeItemLike<T> = any> {
    key: string;
    children?: T[];
}
/** Resolved mutable location of an item in a tree. */
export interface ItemLocation<T extends TreeItemLike<T>> {
    parent: T[];
    index: number;
    item: T;
}
/** Remove repeat indices/wildcards from a path segment. */
export declare function normalizePathSegment(segment: string): string;
/** Split a dotted path into normalized (index-free) segments. */
export declare function splitNormalizedPath(path: string): string[];
/** Find the mutable parent/index/item triple for a dotted tree path. */
export declare function itemLocationAtPath<T extends TreeItemLike<T>>(items: T[], path: string): ItemLocation<T> | undefined;
export declare function getFELDependencies(expression: string): string[];
/**
 * Evaluate a FEL expression and return a structured trace of evaluation steps.
 * See `FelTraceStep` for the step variants; wire format matches Rust `fel_core::TraceStep`.
 */
export declare const evalFELWithTrace: typeof wasmEvalFELWithTrace;
export declare const evaluateDefinition: typeof wasmEvaluateDefinition;
/** Check if a string is a valid FEL identifier (canonical Rust lexer rule). */
export declare const isValidFELIdentifier: typeof wasmIsValidFelIdentifier;
/** Sanitize a string into a valid FEL identifier (strips invalid chars, escapes keywords). */
export declare const sanitizeFELIdentifier: typeof wasmSanitizeFelIdentifier;
/** Compute dependency groups from recorded changeset entries (delegates to Rust/WASM). */
export declare const computeDependencyGroups: typeof wasmComputeDependencyGroups;
