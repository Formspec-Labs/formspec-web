'use client';
/** @filedesc useFieldValue — granular hook for just value + setValue. */
import { useMemo } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
/**
 * Granular field hook — only re-renders when the field's value changes.
 * Use this when you don't need label/error/required state.
 */
export function useFieldValue(path) {
    const { engine } = useFormspecContext();
    const vm = useMemo(() => {
        const fieldVM = engine.getFieldVM(path);
        if (!fieldVM)
            throw new Error(`No FieldViewModel for path "${path}"`);
        return fieldVM;
    }, [engine, path]);
    const value = useSignal(vm.value);
    return { value, setValue: vm.setValue };
}
