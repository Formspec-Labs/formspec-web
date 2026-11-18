/** @filedesc Resolves Surface filing-status references for validation and planning. */
import type { FilingStatusEntry, FilingStatusGroup } from '@formspec-org/types';
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
interface TargetSlot {
    id: string;
    slotType: string;
    binding: unknown;
}
interface TargetRoute {
    id: string;
    params?: readonly {
        name: string;
    }[];
    slots: readonly TargetSlot[];
}
interface FilingStatusTarget<R, S> {
    entry: FilingStatusEntry;
    route: R;
    slot: S;
    params: Readonly<Record<string, string>>;
    pointer: string;
}
export interface FilingStatusIssue {
    pointer: string;
    reason: 'invalid-binding' | 'duplicate-group' | 'route-unresolved' | 'slot-unresolved' | 'invalid-parameters' | 'duplicate-target' | 'mixed-subject-mappings' | 'invalid-subject-value';
}
/** Walk entries by their authored owner. Used for reverse references in editors. */
export declare function filingStatusEntries(binding: unknown): readonly Pick<FilingStatusEntry, 'routeRef' | 'slotRef'>[];
/**
 * Validate exact local targets and bind their parameters. A caller supplying
 * current params also checks for collisions that can only appear at runtime.
 */
export declare function resolveFilingStatusTargets<R extends TargetRoute>(routes: readonly R[], source: TargetRoute, binding: unknown, currentParams?: Readonly<Record<string, string>>): {
    groups: {
        group: FilingStatusGroup;
        pointer: string;
        targets: FilingStatusTarget<R, R['slots'][number]>[];
    }[];
    issues: FilingStatusIssue[];
};
export declare function validateFilingStatusTargets(context: AppGraphContext): AppGraphDiagnostic[];
export {};
