/** @filedesc Internal lightweight draft-mutation revision signal registry for FormEngine instances. */
import type { ReadonlyEngineSignal } from '../reactivity/types.js';
export declare function registerDraftEditVersionSignal(engine: object, signal: ReadonlyEngineSignal<number>): void;
export declare function getDraftEditVersionSignal(engine: object): ReadonlyEngineSignal<number> | undefined;
