'use client';
/** @filedesc useExternalValidation — inject/clear server-side validation results. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';
/**
 * Inject or clear server-side validation results on the engine.
 * Use after server-side validation to display errors from external sources.
 */
export function useExternalValidation() {
    const { engine } = useFormspecContext();
    const inject = useCallback((results) => {
        engine.injectExternalValidation?.(results);
    }, [engine]);
    const clear = useCallback((path) => {
        engine.clearExternalValidation?.(path);
    }, [engine]);
    return { inject, clear };
}
