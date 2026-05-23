'use client';
/** @filedesc useSubmitPending — tracks async submit state to prevent double-submission. */
import { useState, useCallback, useMemo } from 'react';
export function useSubmitPending() {
    const [pending, setPendingRaw] = useState(false);
    const setPending = useCallback((value) => {
        setPendingRaw(value);
    }, []);
    const wrapSubmit = useCallback(async (fn) => {
        setPendingRaw(true);
        try {
            return await fn();
        }
        finally {
            setPendingRaw(false);
        }
    }, []);
    return useMemo(() => ({ pending, setPending, wrapSubmit }), [pending, setPending, wrapSubmit]);
}
