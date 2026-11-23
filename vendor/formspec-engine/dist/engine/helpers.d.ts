/** @filedesc Internal helpers shared by FormEngine (paths, coercion, validation shaping, FEL path rewriting). */
export { cloneValue, deepEqual, isJsonRecord } from '../json-values.js';
import type { EngineSignal } from '../reactivity/types.js';
import type { FormBind, FormDefinition, FormItem, OptionEntry, ValidationResult } from '@formspec-org/types';
import type { EvalValidation } from '../diff.js';
import type { FormEngineRuntimeContext, FormFieldValue, JsonRecord, JsonValue, MappingDiagnostic, RuntimeMappingResult } from '../interfaces.js';
export type EngineBindConfig = FormBind & {
    remoteOptions?: string;
    precision?: number;
    disabledDisplay?: 'hidden' | 'protected';
};
type RuntimeNowInput = Date | string | number;
export declare function normalizeRemoteOptions(payload: unknown): OptionEntry[];
export declare function makeValidationResult(result: Pick<ValidationResult, 'path' | 'severity' | 'constraintKind' | 'code' | 'message' | 'source'> & Partial<Pick<ValidationResult, 'shapeId' | 'context'>>): ValidationResult;
/** Paths stay resolved instance paths with 0-based indexes (Core §4.3.3), exactly as WASM emits them. */
export declare function toValidationResult(result: EvalValidation): ValidationResult;
export declare function toValidationResults(results: EvalValidation[]): ValidationResult[];
export declare function toRuntimeMappingResult(result: {
    direction: string;
    output: JsonValue;
    rulesApplied: number;
    diagnostics: MappingDiagnostic[];
}): RuntimeMappingResult;
export declare function coerceFieldValue(item: FormItem, bind: EngineBindConfig | undefined, definition: FormDefinition, value: FormFieldValue): FormFieldValue;
export declare function validateDataType(value: FormFieldValue, dataType: string): boolean;
export declare function normalizeWasmValue<T>(value: T): T;
export declare function resolveNowProvider(now: FormEngineRuntimeContext['now']): () => Date;
export declare function coerceDate(value: RuntimeNowInput): Date;
export declare function toBasePath(path: string): string;
export declare function parseInstanceTarget(path: string): {
    instanceName: string;
    instancePath?: string;
} | null;
export declare function splitIndexedPath(path: string): string[];
export declare function appendPath(base: string, segment: string): string;
export declare function parentPathOf(path: string): string;
export declare function getAncestorBasePaths(path: string): string[];
export declare function getScopeAncestors(scopePath: string): string[];
export declare function getNestedValue(target: unknown, path: string): FormFieldValue;
export declare function setNestedPathValue(target: JsonRecord, path: string, value: FormFieldValue): void;
export declare function replaceBareCurrentFieldRefs(expression: string, currentFieldName: string): string;
export declare function flattenObject(value: JsonValue, prefix?: string, output?: JsonRecord): JsonRecord;
export declare function isEmptyValue(value: unknown): boolean;
export declare function topoSortKeys<T extends {
    key: string;
}>(nodes: T[], graph: Map<string, Set<string>>): T[];
export declare function snapshotSignals(signals: Record<string, EngineSignal<FormFieldValue>>): JsonRecord;
/** FEL expression addressing only (`$repeat[n]` is 1-based, Core §4.3.3); never for ValidationResult paths. */
export declare function toFelIndexedPath(path: string): string;
export declare function buildRepeatValueAliases(valuesByPath: JsonRecord): Array<[string, FormFieldValue[]]>;
export declare function toRepeatWildcardPath(alias: string): string;
export declare function escapeRegExp(value: string): string;
/**
 * Resolve $group.field qualified refs to sibling refs within repeat context.
 *
 * When evaluating an expression for a field inside a repeat group (e.g., line_items[0].total),
 * a reference like $line_items.qty should resolve to the sibling field "qty" in the same
 * instance, not to a wildcard collecting all instances.
 *
 * For nested repeats (e.g., orders[0].items[0].line_total), $items.qty resolves to the
 * innermost sibling, and $orders.discount_pct resolves to the enclosing group's concrete path.
 */
export declare function resolveQualifiedGroupRefs(expression: string, currentItemPath: string, repeatAncestors: Array<{
    groupPath: string;
    index: number;
    count: number;
}>): string;
