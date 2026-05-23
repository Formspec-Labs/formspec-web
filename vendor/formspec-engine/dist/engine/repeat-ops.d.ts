/** @filedesc Repeat-row subtree clearing and snapshot/restore of nested group field values. */
import type { FormItem } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { OptionEntry } from '@formspec-org/types';
import type { EngineSignal } from '../reactivity/types.js';
import type { RemoteOptionsState } from '../interfaces.js';
/** Remove indexed paths under a repeat root from signal stores and `_data` (reactive structure only). */
export declare function clearRepeatIndexedSubtree(options: {
    rootRepeatPath: string;
    signals: Record<string, EngineSignal<any>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    repeats: Record<string, EngineSignal<number>>;
    data: Record<string, any>;
}): void;
/** Snapshot nested field values under a repeat prefix (used when removing a repeat row). */
export declare function snapshotRepeatGroupTree(items: FormItem[], prefix: string, readFieldValue: (path: string) => unknown, getRepeatCount: (path: string) => number): Record<string, unknown>;
/** Restore nested field values after repeat rows were reindexed. */
export declare function applyRepeatGroupTreeSnapshot(items: FormItem[], prefix: string, snapshot: Record<string, unknown> | undefined, writeField: (path: string, value: unknown) => void): void;
