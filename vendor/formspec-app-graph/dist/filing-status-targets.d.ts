/** @filedesc Resolves Surface filing-status references for validation and planning. */
import type { FilingStatusEntry, FilingStatusGroup, FilingStatusParamSource, FilingStatusSubjectPredicate } from '@formspec-org/types';
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
interface TargetSlot {
    id: string;
    slotType: string;
    binding: unknown;
}
export interface TargetRoute {
    id: string;
    params?: readonly {
        name: string;
    }[];
    slots: readonly TargetSlot[];
}
export interface ResolvedFilingStatusPredicate {
    key: string;
    op: FilingStatusSubjectPredicate['op'];
    from: FilingStatusParamSource;
    value?: string;
    offset?: number;
}
export interface FilingStatusTarget<R, S> {
    entry: FilingStatusEntry;
    route: R;
    slot: S;
    params: Readonly<Record<string, string>>;
    subject?: readonly ResolvedFilingStatusPredicate[];
    pointer: string;
}
export interface FilingStatusIssue {
    pointer: string;
    key?: string;
    reason: 'invalid-binding' | 'duplicate-group' | 'route-unresolved' | 'slot-unresolved' | 'ambiguous-repeat' | 'invalid-repeat-source' | 'invalid-parameters' | 'invalid-subject-predicate' | 'duplicate-target' | 'mixed-subject-mappings' | 'invalid-subject-value';
}
/** Resolve a route and its Definition form within the owning Surface. */
export declare function resolveLocalDefinitionForm<R extends TargetRoute>(routes: readonly R[], routeRef: string, slotRef: string): {
    readonly reason: "route-unresolved";
    route?: undefined;
    slot?: undefined;
} | {
    readonly reason: "slot-unresolved";
    route?: undefined;
    slot?: undefined;
} | {
    route: R;
    slot: R["slots"][number];
    readonly reason?: undefined;
};
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
/** Every member must address a distinct authored subject through an entry parameter or predicate. */
export declare function filingRepeatSubjectBound(entry: FilingStatusEntry, binding: unknown, definition: unknown): boolean;
/** Admit only an explicit array of records with the scalar fields the group consumes. */
export declare function filingRepeatFieldsValid(group: FilingStatusGroup, schema: unknown, targets: readonly {
    entry: FilingStatusEntry;
    binding: unknown;
    definition: unknown;
}[]): boolean;
export declare function validateFilingStatusTargets(context: AppGraphContext): AppGraphDiagnostic[];
export {};
