/** @filedesc Built-in Component route target validation for app graphs. */
import { type AppGraphContext, type AppGraphDiagnostic, type AppGraphSourcePointer, type ResolvedArtifactHandle } from './types.js';
interface ComponentMembership {
    handle: string;
    url: string;
    version?: string;
    pointer: string;
}
interface RouteTarget {
    surface?: {
        url?: string;
        version?: string;
    };
    route?: string;
    slot?: string;
    role?: string;
}
interface ComponentClaim {
    key: string;
    owner: string;
    source: AppGraphSourcePointer;
    component: ResolvedArtifactHandle;
    membership: ComponentMembership;
    target: RouteTarget;
}
export declare function isExactVersion(value: string | undefined): value is string;
/** Shared claim collection; callers must establish schema admission first. */
export declare function collectComponentRouteClaims(context: AppGraphContext): {
    diagnostics: AppGraphDiagnostic[];
    claims: ComponentClaim[];
};
export declare function validateComponentRouteTargets(context: AppGraphContext): AppGraphDiagnostic[];
export {};
