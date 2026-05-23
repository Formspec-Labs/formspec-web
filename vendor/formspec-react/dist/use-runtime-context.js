'use client';
/** @filedesc useRuntimeContext — inject runtime context (now, locale, timezone, meta) into the engine. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';
export function useRuntimeContext() {
    const { engine } = useFormspecContext();
    const setRuntimeContext = useCallback((context) => {
        engine.setRuntimeContext(context);
    }, [engine]);
    return { setRuntimeContext };
}
