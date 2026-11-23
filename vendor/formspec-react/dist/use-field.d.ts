import type { ResolvedOption, ResolvedValidationResult } from '@formspec-org/engine';
export interface UseFieldResult {
    id: string;
    path: string;
    itemKey: string;
    dataType: string;
    label: string;
    labelNeedAnchors: string[];
    hint: string | null;
    hintNeedAnchors: string[];
    description: string | null;
    descriptionNeedAnchors: string[];
    value: any;
    required: boolean;
    visible: boolean;
    readonly: boolean;
    touched: boolean;
    errors: ResolvedValidationResult[];
    error: string | null;
    options: ResolvedOption[];
    optionsState: {
        loading: boolean;
        error: string | null;
    };
    disabledDisplay: 'hidden' | 'protected';
    setValue(value: any): void;
    /**
     * Mark this field as touched by the filer's interaction (e.g., on blur), so its errors show. Does nothing
     * for a field the filer cannot change: read-only, calculated (read-only through its `calculate` bind), or
     * protected. Its errors show after an explicit pass over all fields: Save, Submit, a wizard step (Core §5.5).
     */
    touch(): void;
    inputProps: {
        id: string;
        name: string;
        value: any;
        onChange: (e: {
            target: {
                value: any;
            };
        }) => void;
        onBlur: () => void;
        required: boolean;
        readOnly: boolean;
        tabIndex?: number;
        'aria-invalid': boolean;
        'aria-required': boolean;
    };
}
/**
 * Full field state from a FieldViewModel.
 * Re-renders when any signal on the VM changes.
 * For finer-grained subscriptions, use useFieldValue/useFieldError.
 */
export declare function useField(path: string): UseFieldResult;
