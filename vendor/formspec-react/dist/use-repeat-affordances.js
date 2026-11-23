'use client';
/** @filedesc useRepeatAffordances — the engine's repeat affordance rule (relevance, min/maxRepeat Add/Remove) for React. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import { readRepeatAffordances } from '@formspec-org/engine/render';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';
function walkInstancePath(root, path) {
    if (!path)
        return root;
    let current = root;
    for (const segment of path.split('.').filter(Boolean)) {
        if (current === null || typeof current !== 'object')
            return undefined;
        current = current[segment];
    }
    return current;
}
function resolveUpstreamSeededCount(engine, item) {
    const seedFrom = item?.seedFrom;
    if (!seedFrom?.instance || seedFrom.where)
        return null;
    // Subscribe to instanceVersion when available so runtime-loaded instances recalculate cleanly.
    engine.instanceVersion?.value;
    const runtimeReader = engine.getInstanceData;
    if (typeof runtimeReader === 'function') {
        const fromRuntime = runtimeReader.call(engine, seedFrom.instance, seedFrom.path);
        if (Array.isArray(fromRuntime))
            return fromRuntime.length;
    }
    const instances = engine.getDefinition?.()?.instances;
    const fromStatic = walkInstancePath(instances?.[seedFrom.instance]?.data, seedFrom.path);
    return Array.isArray(fromStatic) ? fromStatic.length : null;
}
/**
 * Repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`), with the
 * node's `allowAdd` / `allowRemove` locks (component §4.4).
 */
export function useRepeatAffordances(repeatPath, locks = {}) {
    const { engine } = useFormspecContext();
    const { allowAdd, allowRemove } = locks;
    const state = useMemo(() => computed(() => {
        const item = findItemByKey(engine.getDefinition().items ?? [], repeatPath);
        const base = readRepeatAffordances(engine, repeatPath, item, { allowAdd, allowRemove });
        const isSeeded = Boolean(item?.seedFrom);
        return {
            ...base,
            isSeeded,
            upstreamSeededCount: isSeeded ? resolveUpstreamSeededCount(engine, item) : null,
        };
    }), [engine, repeatPath, allowAdd, allowRemove]);
    return useSignal(state);
}
