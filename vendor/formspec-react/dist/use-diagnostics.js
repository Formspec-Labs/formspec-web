'use client';
/** @filedesc useDiagnostics — captures engine state snapshots for debugging and audit. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';
export function useDiagnostics() {
    const { engine } = useFormspecContext();
    const getSnapshot = useCallback((options) => {
        return engine.getDiagnosticsSnapshot(options);
    }, [engine]);
    return { getSnapshot };
}
