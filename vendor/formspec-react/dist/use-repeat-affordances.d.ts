import type { RepeatAffordanceLocks, RepeatAffordanceState } from '@formspec-org/engine/render';
export interface RepeatAffordanceHookState extends RepeatAffordanceState {
    /** True when the repeatable group declares `seedFrom` (upstream carried rows). */
    isSeeded: boolean;
    /** Exact upstream array length when determinable from runtime or static instance data, else null. */
    upstreamSeededCount: number | null;
}
/**
 * Repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`), with the
 * node's `allowAdd` / `allowRemove` locks (component §4.4).
 */
export declare function useRepeatAffordances(repeatPath: string, locks?: RepeatAffordanceLocks): RepeatAffordanceHookState;
