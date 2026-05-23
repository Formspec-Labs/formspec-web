import type { ResolvedOption, ResolvedValidationResult } from '@formspec-org/engine';
export interface UseFieldResult {
    id: string;
    path: string;
    itemKey: string;
    dataType: string;
    label: string;
    hint: string | null;
    description: string | null;
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
    /** Mark this field as touched (e.g., on blur). */
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
