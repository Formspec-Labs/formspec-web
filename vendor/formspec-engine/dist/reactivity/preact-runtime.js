/** @filedesc Default FormEngine reactive layer using `@preact/signals-core`. */
import { batch as preactBatch, computed as preactComputed, effect as preactEffect, signal as preactSignal, } from '@preact/signals-core';
export const preactReactiveRuntime = {
    signal: (initial) => preactSignal(initial),
    computed: (fn) => preactComputed(fn),
    effect: (fn) => preactEffect(fn),
    batch: (fn) => preactBatch(fn),
};
