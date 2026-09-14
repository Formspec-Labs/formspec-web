/**
 * @filedesc Slot dispatch — the only place in the stack where a `slotType`
 * becomes something renderable.
 *
 * The taxonomy is closed and shipped (ADR 0150 §6.2), enforced by the schema, by
 * `formspec-lint`, and by the app-graph validator. Until the surface-render-v10
 * spike, **no runtime anywhere read it** (gap ledger `slot-dispatch`).
 *
 * Two shapes make this worth owning centrally rather than re-writing per host:
 *
 * 1. **It is exhaustive, and the compiler holds it.** The switch has no
 *    `default` arm and ends in a `never` check, so a sixth slot type — which
 *    lands through the Registry's `slot-type` contribution category, not through
 *    a schema edit — breaks the build HERE, at the decision site. That is the
 *    same discipline `ROUTE_CLASS_THEME_AUTHORITY` uses.
 * 2. **It plans, it does not render.** A `SlotPlan` is data: a React binding, a
 *    web-component binding, and a server-side pre-renderer all consume the same
 *    plan. Putting the dispatch in one renderer means every other renderer
 *    writes it again and disagrees with the last one.
 *
 * `embed-route` is planned here too, recursively, because it is a composition
 * primitive and leaving it out means the closed taxonomy is not actually closed
 * over. Two properties it must have, both taken from how
 * `ui-graph-policy.ts`'s `widgetBindingsRenderedBy` walks the same edges:
 *
 * - **The host's theme grant carries down every embed edge.** An embedded route
 *   paints on the host's surface (ADR 0150 §6.2), so an embedded `intake` route
 *   inside a `proof` route does NOT get to restore tenant branding. The plan
 *   therefore never re-resolves a grant for embedded content.
 * - **Cycles terminate.** `routeRef` is constrained to a route id, not to an
 *   acyclic graph, so `a` embedding `b` embedding `a` is authorable. The visited
 *   set is a termination requirement, not an optimisation.
 */
import type { FormDefinition, RegistryEntry } from '@formspec-org/types';
import type { ExperienceDocument } from '@formspec-org/types';
import { type SurfaceDiagnostic } from './diagnostics.js';
import type { SurfaceRoute } from './route-path.js';
import type { SurfaceRouteHandle } from './composition.js';
import { type ExperienceDocumentHandle, type ExperienceUnitPlan } from './experience-unit.js';
import { type HeadingLevel, type StaticContentPlan, type SurfaceStaticAssetResolver } from './static-content.js';
import type { WidgetKey, WidgetRegistry, WidgetResolution } from './registry.js';
import type { ResponseActionsDocumentLike } from './transitions.js';
import { type DataSourceCatalogHandle, type WidgetDataInputPlan } from './data-source-loader.js';
import { type DefinitionFormInitialDataPlan, type MappingDocumentHandle } from './definition-form-initial-data.js';
export type SurfaceSlot = SurfaceRoute['slots'][number];
export interface SlotPlanBase {
    slotId: string;
    /** Direct authored Need anchors for the visible slot container and title. */
    needAnchors?: readonly string[];
    title?: string;
    /** `slot.position` — an author hint with no normative vocabulary at v0.1. */
    position?: string;
    /** Heading level content inside this slot starts at. */
    headingBaseLevel: HeadingLevel;
}
export type SlotPlan<TComponent> = SlotPlanBase & ({
    slotType: 'definition-form';
    definitionRef: string;
    presentation?: string;
    /** Qualified Data Source plan used before the form engine mounts. */
    initialData?: DefinitionFormInitialDataPlan;
    definition?: FormDefinition;
    registryEntries: readonly RegistryEntry[];
    status: 'ready' | 'unresolved';
} | {
    slotType: 'experience-unit';
    unit: ExperienceUnitPlan;
} | {
    slotType: 'module-widget';
    key: WidgetKey;
    config?: Readonly<Record<string, unknown>>;
    /** Registry-declared inputs after exact qualified-source resolution. */
    dataInputs: readonly WidgetDataInputPlan[];
    /** Registry-declared outputs with their exact authored mappings, if any. */
    actionOutputs: readonly WidgetActionOutputPlan[];
    resolution: WidgetResolution<TComponent>;
} | {
    slotType: 'static-content';
    content: StaticContentPlan | undefined;
    /** Direct authored Need anchors for the visible binding content. */
    contentNeedAnchors?: readonly string[];
} | {
    slotType: 'unknown';
    /** The value received after validation was bypassed or input was corrupted. */
    authoredSlotType: unknown;
} | {
    slotType: 'embed-route';
    routeRef: string;
    mode?: string;
    /** The embedded route's own slots, planned. Empty when unresolved. */
    slots: readonly SlotPlan<TComponent>[];
    status: 'ready' | 'unresolved' | 'cycle';
});
export interface SlotPlanContext<TComponent> {
    handle: SurfaceRouteHandle;
    experiences: readonly ExperienceDocument[];
    /** Exact manifested source identity for qualified Experience bindings. */
    experienceHandles?: readonly ExperienceDocumentHandle[] | undefined;
    definitions: ReadonlyMap<string, FormDefinition>;
    registryEntries: readonly RegistryEntry[];
    widgets: WidgetRegistry<TComponent>;
    /** Exact manifested Data Sources catalog handles. */
    dataSources?: readonly DataSourceCatalogHandle[] | undefined;
    /** Manifested Mapping documents keyed by their App Manifest handles. */
    mappings?: readonly MappingDocumentHandle[] | undefined;
    /** Manifest URL of `handle.surface`, required by Surface/route/slot availability. */
    surfaceRef?: string | undefined;
    /** Loaded Response Actions documents used to resolve bound widget action metadata. */
    responseActions?: readonly ResponseActionsDocumentLike[] | undefined;
    /** Level route content starts at. Default 2 — the route title is the `h1`. */
    headingBaseLevel?: HeadingLevel;
    /** Host admission boundary for authored static image sources. */
    staticAssetResolver?: SurfaceStaticAssetResolver | undefined;
}
export type WidgetActionLabelPlan = Readonly<{
    literal: string;
}> | Readonly<{
    ref: string;
}>;
export interface WidgetActionMetadataPlan {
    /** Exact action id selected by the Surface output binding. */
    actionRef: string;
    /** Authored Response Actions intent. Metadata only; execution stays in the host port. */
    intent: string;
    /** Authored label form, retained without inventing display text. */
    label?: WidgetActionLabelPlan | undefined;
    /** Direct authored Need anchors on the resolved Response Actions Action. */
    needAnchors?: readonly string[] | undefined;
}
export interface WidgetActionOutputPlan {
    name: string;
    actionRef?: string | undefined;
    /** Present only when `actionRef` resolves to exactly one loaded Action. */
    action?: WidgetActionMetadataPlan | undefined;
}
export interface RoutePlan<TComponent> {
    handle: SurfaceRouteHandle;
    slots: readonly SlotPlan<TComponent>[];
    diagnostics: readonly SurfaceDiagnostic[];
}
export declare function planRoute<TComponent>(context: SlotPlanContext<TComponent>): RoutePlan<TComponent>;
