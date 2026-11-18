import type { FormDefinition } from '@formspec-org/types';
import { type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { DataSourceSubject } from './data-source-loader.js';
import type { FilingDraftQuery } from './draft-port.js';
import type { SurfaceDefinitionComponentResolver } from './slot-plan.js';
import type { SurfaceRoute } from './route-path.js';
import type { ThemeAuthority } from './theme-authority.js';
export type FilingSectionLocaleLookup = (definition: FormDefinition, key: string) => string | null;
export interface FilingStatusSectionPlan {
    id: string;
    label: string;
    href: string;
    weight: number;
}
interface FilingStatusEntryPlan {
    key: string;
    hint?: string;
    description?: string;
    needAnchors: readonly string[];
}
export type FilingStatusRowPlan = FilingStatusEntryPlan & ({
    status: 'ready';
    href: string;
    route: SurfaceRouteHandle;
    query: FilingDraftQuery;
    sections: readonly FilingStatusSectionPlan[];
    weight: number;
} | {
    status: 'disabled';
    route?: SurfaceRouteHandle;
    routeRef: string;
    reason: FilingStatusRowRefusal;
});
type FilingStatusRowRefusal = 'route-address-unavailable' | 'definition-unresolved' | 'slot-unresolved' | 'subject-unavailable' | 'invalid-binding';
export interface FilingStatusGroupPlan {
    id: string;
    label: string;
    needAnchors: readonly string[];
    rows: readonly FilingStatusRowPlan[];
}
export type FilingStatusPlan = {
    status: 'ready';
    groups: readonly FilingStatusGroupPlan[];
    needAnchors: readonly string[];
} | {
    status: 'unresolved';
    reason: string;
};
export declare function planFilingStatus(input: {
    app: SurfaceApp;
    handle: SurfaceRouteHandle;
    bindingRoute: SurfaceRoute;
    binding: unknown;
    params: Readonly<Record<string, string>>;
    definitions: ReadonlyMap<string, FormDefinition>;
    themeAuthority: ThemeAuthority;
    resolveDefinitionComponent?: SurfaceDefinitionComponentResolver | undefined;
    resolveDefinitionLocaleString?: FilingSectionLocaleLookup | undefined;
    surfaceRef?: string | undefined;
    resolveSubject: (definition: FormDefinition, binding: Record<string, unknown>, route: SurfaceRoute, params: Readonly<Record<string, string>>) => DataSourceSubject | false | undefined;
}): FilingStatusPlan;
export {};
