/** @filedesc Repeat-row subtree clearing and capture of field state and nested repeats. */
import type { FormItem } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { OptionEntry } from '@formspec-org/types';
import type { EngineSignal } from '../reactivity/types.js';
import type { FormFieldValue, RemoteOptionsState, WriteSource } from '../interfaces.js';
/** Remove the selected repeat paths from signal stores and primary data. */
export declare function clearRepeatIndexedSubtree(options: {
    includesPath: (path: string) => boolean;
    signals: Record<string, EngineSignal<any>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    writeSources: Record<string, EngineSignal<WriteSource | null>>;
    optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    repeats: Record<string, EngineSignal<number>>;
    data: Record<string, any>;
}): void;
interface RepeatFieldState {
    value: FormFieldValue;
    writeSource: WriteSource | null;
}
export interface RepeatRowSnapshot {
    fields: Array<RepeatFieldState & {
        path: string;
    }>;
    repeats: Array<{
        path: string;
        item: FormItem;
        count: number;
    }>;
}
/** Capture paths relative to the row so the same state can be restored at its new index. */
export declare function snapshotRepeatRow(items: FormItem[], rowPath: string, readField: (path: string) => RepeatFieldState, getRepeatCount: (path: string) => number): RepeatRowSnapshot;
export {};
