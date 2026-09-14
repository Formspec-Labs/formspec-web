import type { UseFieldResult } from './use-field';
/**
 * Publish the exact set-value capability of a mounted field control.
 *
 * The shipped DefaultField calls this. A custom field component must call it
 * itself; the parent renderer does not assume that an override actually
 * rendered an editable control.
 */
export declare function useSemanticFieldControl(field: UseFieldResult, disabled: boolean): void;
