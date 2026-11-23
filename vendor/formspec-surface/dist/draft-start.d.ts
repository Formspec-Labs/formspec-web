import type { FormDefinition } from '@formspec-org/types';
import { type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { DataSourceSubject } from './data-source-loader.js';
import type { SurfaceRoute } from './route-path.js';
export declare function planDraftStart(app: SurfaceApp, handle: SurfaceRouteHandle, source: SurfaceRoute, binding: unknown, definitions: ReadonlyMap<string, FormDefinition>, params: Readonly<Record<string, string>>): {
    app: SurfaceApp;
    destination: SurfaceRouteHandle;
    label: string;
    slotId: string;
    keys: {
        key: string;
        parameter: string;
        dataType: "string" | "integer";
        minted: boolean;
    }[];
    params: {
        [k: string]: string;
    };
    definitionUrl: string;
    definitionVersion: string;
    subject: {
        type: string;
        keys: {
            [k: string]: string | number;
        };
    };
} | undefined;
export type DraftStartPlan = NonNullable<ReturnType<typeof planDraftStart>>;
export declare function draftStartHref(plan: DraftStartPlan, subject: DataSourceSubject): string | undefined;
