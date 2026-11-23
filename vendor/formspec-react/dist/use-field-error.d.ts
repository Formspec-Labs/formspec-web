import type { IFormEngine, ResolvedValidationResult } from '@formspec-org/engine';
/** Read live error-severity Shape validation results targeting an exact field or group path. */
export declare function readPathShapeErrors(engine: IFormEngine, path: string): ResolvedValidationResult[];
/** Reactive hook returning active error-severity Shape results targeting a group or repeat path. */
export declare function usePathShapeErrors(path: string | undefined): ResolvedValidationResult[];
/**
 * Granular field hook — only re-renders when the field's error state changes.
 * Returns the first error message string (including Shape errors targeting this field), or null if valid.
 */
export declare function useFieldError(path: string): string | null;
