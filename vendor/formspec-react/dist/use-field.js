'use client';
/** @filedesc useField — full reactive field state from FieldViewModel. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
import { readPathShapeErrors } from './use-field-error';
/**
 * Full field state from a FieldViewModel.
 * Re-renders when any signal on the VM changes.
 * For finer-grained subscriptions, use useFieldValue/useFieldError.
 */
export function useField(path) {
    const { engine, touchField, touchedVersion, isTouched, advanceSemanticResponseRevision, } = useFormspecContext();
    const vm = useMemo(() => {
        const fieldVM = engine.getFieldVM(path);
        if (!fieldVM)
            throw new Error(`No FieldViewModel for path "${path}". Is the field defined?`);
        return fieldVM;
    }, [engine, path]);
    const label = useSignal(vm.label);
    const labelNeedAnchors = useSignal(vm.labelNeedAnchors);
    const hint = useSignal(vm.hint);
    const hintNeedAnchors = useSignal(vm.hintNeedAnchors);
    const description = useSignal(vm.description);
    const descriptionNeedAnchors = useSignal(vm.descriptionNeedAnchors);
    const value = useSignal(vm.value);
    const required = useSignal(vm.required);
    const visible = useSignal(vm.visible);
    const readonly = useSignal(vm.readonly);
    const bindErrors = useSignal(vm.errors);
    const bindFirstError = useSignal(vm.firstError);
    const shapeErrors = useSignal(useMemo(() => computed(() => readPathShapeErrors(engine, vm.instancePath)), [engine, vm]));
    const errors = useMemo(() => {
        if (shapeErrors.length === 0)
            return bindErrors;
        const seen = new Set(bindErrors.map((e) => `${e.severity}|${e.message}`));
        const extra = shapeErrors.filter((e) => !seen.has(`${e.severity}|${e.message}`));
        return extra.length === 0 ? bindErrors : [...bindErrors, ...extra];
    }, [bindErrors, shapeErrors]);
    const firstError = bindFirstError ?? shapeErrors[0]?.message ?? null;
    const options = useSignal(vm.options);
    const optionsState = useSignal(vm.optionsState);
    // Subscribe to touched version for reactivity
    const _touchedVersion = useSignal(touchedVersion);
    const touched = isTouched(vm.instancePath);
    // Read-only, calculated and protected fields stay untouched (see UseFieldResult.touch).
    const touch = useMemo(() => () => {
        if (vm.readonly.value || (!vm.visible.value && vm.disabledDisplay === 'protected'))
            return;
        touchField(vm.instancePath);
    }, [touchField, vm]);
    const setValue = useMemo(() => (nextValue) => {
        vm.setValue(nextValue);
        advanceSemanticResponseRevision();
    }, [advanceSemanticResponseRevision, vm]);
    const inputProps = useMemo(() => ({
        id: vm.id,
        name: vm.instancePath,
        value: value ?? '',
        onChange: (e) => setValue(e.target.value),
        onBlur: touch,
        required,
        readOnly: readonly,
        ...(readonly ? { tabIndex: -1 } : {}),
        'aria-invalid': !!firstError,
        'aria-required': required,
    }), [vm, value, required, readonly, firstError, touch, setValue]);
    return {
        id: vm.id,
        path: vm.instancePath,
        itemKey: vm.itemKey,
        dataType: vm.dataType,
        label,
        labelNeedAnchors,
        hint,
        hintNeedAnchors,
        description,
        descriptionNeedAnchors,
        value,
        required,
        visible,
        readonly,
        touched,
        errors,
        error: firstError,
        options,
        optionsState,
        disabledDisplay: vm.disabledDisplay,
        setValue,
        touch,
        inputProps,
    };
}
