/** @filedesc Commit native select choices before host input rerenders and deduplicate change events. */
'use client';
import { useLayoutEffect, useRef } from 'react';
export function useNativeSelect(onValueChange) {
    const ref = useRef(null);
    const committed = useRef(undefined);
    // React may render a different spelling from the engine's canonical value (1.50 vs 1.5).
    // The later change event reports the DOM value, so track what React actually selected.
    useLayoutEffect(() => { committed.current = ref.current?.value; });
    const commit = (event) => {
        const next = event.currentTarget.value;
        if (next !== committed.current) {
            committed.current = next;
            onValueChange?.(next);
        }
    };
    return { ref, onInput: commit, onChange: commit };
}
