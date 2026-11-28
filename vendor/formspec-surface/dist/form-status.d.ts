import type { FormDefinition } from '@formspec-org/types';
import { type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { DataSourceCatalogHandle, DataSourceLoadRequest, LoadWidgetDataInputsRequest, DataSourceSubject } from './data-source-loader.js';
import { type FormStatusQuery } from './draft-port.js';
import type { SurfaceDefinitionComponentResolver } from './slot-plan.js';
import type { SurfaceRoute } from './route-path.js';
import type { ThemeAuthority } from './theme-authority.js';
export type FormStatusSectionLocaleLookup = (definition: FormDefinition, key: string) => string | null;
export interface FormStatusSectionPlan {
    id: string;
    label: string;
    href?: string | undefined;
    weight: number;
}
export interface ResolvedFormStatusLinks {
    href: string;
    params: Readonly<Record<string, string>>;
    sections: Readonly<Record<string, string>>;
}
interface FormStatusEntryPlan {
    key: string;
    hint?: string;
    description?: string;
    needAnchors: readonly string[];
}
export type FormStatusRowPlan = FormStatusEntryPlan & ({
    status: 'ready';
    slotId: string;
    params?: Readonly<Record<string, string>> | undefined;
    href?: string | undefined;
    resolveLinks?: ((subject: DataSourceSubject) => ResolvedFormStatusLinks | undefined) | undefined;
    route: SurfaceRouteHandle;
    query: FormStatusQuery;
    sections: readonly FormStatusSectionPlan[];
    fieldTemplates: readonly string[];
    weight: number;
} | {
    status: 'disabled';
    route?: SurfaceRouteHandle;
    routeRef: string;
    reason: FormStatusRowRefusal;
});
type FormStatusRowRefusal = 'route-address-unavailable' | 'definition-unresolved' | 'slot-unresolved' | 'subject-unavailable' | 'invalid-binding';
export interface FormStatusGroupPlan {
    id: string;
    label: string;
    needAnchors: readonly string[];
    unavailable?: boolean;
    member?: {
        groupId: string;
        label: string;
        waitingLabel: string;
    };
    rows: readonly FormStatusRowPlan[];
}
export type FormStatusPlan = {
    status: 'ready';
    groups: readonly FormStatusGroupPlan[];
    needAnchors: readonly string[];
} | {
    status: 'roster';
    requests: readonly DataSourceLoadRequest[];
    load(ports: Pick<LoadWidgetDataInputsRequest, 'loader' | 'authorize' | 'validatePayload'>, sessionGeneration?: string): Promise<FormStatusPlan>;
} | {
    status: 'unresolved';
    reason: string;
};
export interface FormStatusPlanInput {
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
    resolveDefinitionLocaleString?: FormStatusSectionLocaleLookup | undefined;
    surfaceRef?: string | undefined;
    resolveSubject: (definition: FormDefinition, binding: Record<string, unknown>, route: SurfaceRoute, params: Readonly<Record<string, string>>) => DataSourceSubject | false | undefined;
}
export declare function planFormStatus(input: FormStatusPlanInput): FormStatusPlan;
export {};
