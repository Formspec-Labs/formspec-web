import type { FormDefinition } from '@formspec-org/types';
import { type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { DataSourceCatalogHandle, DataSourceLoadRequest, LoadWidgetDataInputsRequest, DataSourceSubject } from './data-source-loader.js';
import { type FilingDraftQuery } from './draft-port.js';
import type { SurfaceDefinitionComponentResolver } from './slot-plan.js';
import type { SurfaceRoute } from './route-path.js';
import type { ThemeAuthority } from './theme-authority.js';
export type FilingSectionLocaleLookup = (definition: FormDefinition, key: string) => string | null;
export interface FilingStatusSectionPlan {
    id: string;
    label: string;
    href?: string | undefined;
    weight: number;
}
export interface ResolvedFilingStatusLinks {
    href: string;
    params: Readonly<Record<string, string>>;
    sections: Readonly<Record<string, string>>;
}
interface FilingStatusEntryPlan {
    key: string;
    hint?: string;
    description?: string;
    needAnchors: readonly string[];
}
export type FilingStatusRowPlan = FilingStatusEntryPlan & ({
    status: 'ready';
    slotId: string;
    params?: Readonly<Record<string, string>> | undefined;
    href?: string | undefined;
    resolveLinks?: ((subject: DataSourceSubject) => ResolvedFilingStatusLinks | undefined) | undefined;
    route: SurfaceRouteHandle;
    query: FilingDraftQuery;
    sections: readonly FilingStatusSectionPlan[];
    fieldTemplates: readonly string[];
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
    unavailable?: boolean;
    member?: {
        groupId: string;
        label: string;
        waitingLabel: string;
    };
    rows: readonly FilingStatusRowPlan[];
}
export type FilingStatusPlan = {
    status: 'ready';
    groups: readonly FilingStatusGroupPlan[];
    needAnchors: readonly string[];
} | {
    status: 'roster';
    requests: readonly DataSourceLoadRequest[];
    load(ports: Pick<LoadWidgetDataInputsRequest, 'loader' | 'authorize' | 'validatePayload'>, sessionGeneration?: string): Promise<FilingStatusPlan>;
} | {
    status: 'unresolved';
    reason: string;
};
export interface FilingPlanInput {
    slotId: string;
    dataSources?: readonly DataSourceCatalogHandle[] | undefined;
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
}
export declare function planFilingStatus(input: FilingPlanInput): FilingStatusPlan;
export {};
