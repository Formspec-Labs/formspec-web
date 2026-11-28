/** @filedesc Resolves Surface form-status references for validation and planning. */
import type { FormStatusEntry, FormStatusGroup, FormStatusParamSource, FormStatusSubjectPredicate } from '@formspec-org/types';
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
export interface ResolvedFormStatusPredicate {
    key: string;
    op: FormStatusSubjectPredicate['op'];
    from: FormStatusParamSource;
    value?: string;
    offset?: number;
}
export interface FormStatusTarget<R, S> {
    entry: FormStatusEntry;
    route: R;
    slot: S;
    params: Readonly<Record<string, string>>;
    subject?: readonly ResolvedFormStatusPredicate[];
    pointer: string;
}
export interface FormStatusIssue {
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
export declare function formStatusEntries(binding: unknown): readonly Pick<FormStatusEntry, 'routeRef' | 'slotRef'>[];
/**
 * Validate exact local targets and bind their parameters. A caller supplying
 * current params also checks for collisions that can only appear at runtime.
 */
export declare function resolveFormStatusTargets<R extends TargetRoute>(routes: readonly R[], source: TargetRoute, binding: unknown, currentParams?: Readonly<Record<string, string>>): {
    groups: {
        group: FormStatusGroup;
        pointer: string;
        targets: FormStatusTarget<R, R['slots'][number]>[];
    }[];
    issues: FormStatusIssue[];
};
/** Every member must address a distinct authored subject through an entry parameter or predicate. */
export declare function formStatusRepeatSubjectBound(entry: FormStatusEntry, binding: unknown, definition: unknown): boolean;
/** Admit only an explicit array of records with the scalar fields the group consumes. */
export declare function formStatusRepeatFieldsValid(group: FormStatusGroup, schema: unknown, targets: readonly {
    entry: FormStatusEntry;
    binding: unknown;
    definition: unknown;
}[]): boolean;
export declare function validateFormStatusTargets(context: AppGraphContext): AppGraphDiagnostic[];
export {};
