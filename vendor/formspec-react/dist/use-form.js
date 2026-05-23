'use client';
/** @filedesc useForm — form-level reactive state (title, validity, submit). */
import { useMemo, useCallback } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
function responseProfileForTuple(validationTuple) {
    return validationTuple?.persistence === 'complete-response' ? 'on-submit' : 'off';
}
/**
 * Form-level state from FormViewModel.
 * Provides title, validity, and submit/response access.
 */
export function useForm() {
    const { engine, touchAllFields } = useFormspecContext();
    const formVM = useMemo(() => engine.getFormVM(), [engine]);
    const title = useSignal(formVM.title);
    const description = useSignal(formVM.description);
    const isValid = useSignal(formVM.isValid);
    const validationSummary = useSignal(formVM.validationSummary);
    const submit = useCallback((options) => {
        touchAllFields();
        const profile = options?.profile ?? options?.validationTuple?.profile ?? 'on-submit';
        const report = engine.getValidationReport({ profile });
        const response = engine.getResponse({
            profile: responseProfileForTuple(options?.validationTuple),
            id: options?.id,
            author: options?.author,
            subject: options?.subject,
        });
        return { response, validationReport: report };
    }, [engine, touchAllFields]);
    const getResponse = useCallback((meta) => {
        return engine.getResponse(meta);
    }, [engine]);
    return {
        title,
        description,
        isValid,
        validationSummary,
        submit,
        getResponse,
    };
}
