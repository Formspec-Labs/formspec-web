/** @filedesc Resolve a new draft's destination and the source of each subject key. */
import type { FormDefinition } from '@formspec-org/types';
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
import { type TargetRoute } from './form-status-targets.js';
export declare function resolveDraftStartTarget<R extends TargetRoute>(routes: readonly R[], source: TargetRoute, binding: unknown, lookupDefinition: (ref: string) => FormDefinition | undefined): {
    route: R;
    slotId: string;
    label: string;
    definition: FormDefinition;
    type: string;
    keys: {
        key: string;
        parameter: string;
        dataType: "string" | "integer";
        minted: boolean;
    }[];
    inherited: string[];
} | undefined;
export declare function validateDraftStartTargets(context: AppGraphContext): AppGraphDiagnostic[];
