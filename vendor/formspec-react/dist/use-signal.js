'use client';
/** @filedesc Generic Preact-signal → React bridge via useSyncExternalStore. */
import { useSyncExternalStore, useRef, useCallback } from 'react';
import { effect } from '@preact/signals-core';
/**
 * Subscribe to a Preact `ReadonlyEngineSignal` from React.
 *
 * Uses `useSyncExternalStore` for tear-free reads.
 * The `effect()` from `@preact/signals-core` auto-tracks signal
 * dependencies, so the React callback fires exactly when the
 * signal's value changes.
 */
export function useSignal(signal) {
    const signalRef = useRef(signal);
    signalRef.current = signal;
    const subscribe = useCallback((onStoreChange) => {
        return effect(() => {
            signalRef.current.value; // track the signal
            onStoreChange();
        });
    }, []);
    const getSnapshot = useCallback(() => signalRef.current.value, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
