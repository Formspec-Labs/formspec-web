import { type RepeatAffordanceLocks, type RepeatAffordanceState } from '@formspec-org/engine/render';
/**
 * Repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`), with the
 * node's `allowAdd` / `allowRemove` locks (component §4.4).
 */
export declare function useRepeatAffordances(repeatPath: string, locks?: RepeatAffordanceLocks): RepeatAffordanceState;
