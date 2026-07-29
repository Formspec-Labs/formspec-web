import type { RegistryDocument, RegistryEntry } from '@formspec-org/types';
import { type SurfaceDiagnostic, type SurfaceDiagnosticSite } from './diagnostics.js';
export interface WidgetKey {
    moduleId: string;
    /** Matches `widgetShape.widgetName`. NOT the contribution id. */
    widgetName: string;
}
/**
 * A module's runtime contribution: the components behind the widgets its
 * Registry entry declares.
 *
 * Keys are `widgetShape.widgetName` values. A module whose Registry entry
 * declares a widget it does not key here resolves as `unimplemented` — which is
 * the honest report of "declared but not shipped", and the state the whole
 * stack was in before this seam existed.
 */
export interface WidgetModule<TComponent> {
    moduleId: string;
    widgets: Readonly<Record<string, TComponent>>;
}
/**
 * Two independent axes, never collapsed into one: **declared** is whether a
 * Registry in the bundle says the widget exists, **implemented** is whether the
 * host supplied a component for it. `undeclared` is an authoring defect and
 * `unimplemented` is a deployment defect; collapsing them loses the only
 * information that says who fixes it.
 *
 * The cross case — a host component for a widget the bundle never declared —
 * renders (`status: 'resolved'`) and carries `declared: false`, which is what
 * `WIDGET-UNDECLARED` reports on. A host that registers a component the bundle
 * never declared is rendering something outside the signed graph; suppressing
 * the diagnostic because the pixels happened to work makes host-supplied
 * content indistinguishable from bundle-declared content, which is the one
 * distinction a signed bundle exists to make (surface-shell-spec §3.3). A shell
 * MAY render it; it MUST say it did.
 */
export type WidgetResolution<TComponent> = {
    status: 'resolved';
    /** False when the component came from the host and no Registry declares it. */
    declared: boolean;
    component: TComponent;
    /** `RegistryEntry.name` — present when the bundle declares the widget. */
    contributionName?: string;
    entry?: RegistryEntry;
} | {
    /** The bundle declares it; no registered module supplies a component. */
    status: 'unimplemented';
    contributionName?: string;
    entry?: RegistryEntry;
} | {
    /** No Registry in the bundle declares it, and nothing implements it. */
    status: 'undeclared';
};
export interface WidgetRegistry<TComponent> {
    resolve(key: WidgetKey): WidgetResolution<TComponent>;
    /** Diagnostic for an unresolved binding, so a caller does not phrase its own. */
    diagnose(key: WidgetKey, resolution: WidgetResolution<TComponent>, site: SurfaceDiagnosticSite): SurfaceDiagnostic | undefined;
    readonly moduleIds: readonly string[];
}
export interface WidgetRegistryInput<TComponent> {
    modules?: readonly WidgetModule<TComponent>[];
    /** Flattened Registry entries — see {@link flattenRegistryEntries}. */
    registryEntries?: readonly RegistryEntry[];
}
/**
 * The Registry entry whose `widgetShape.widgetName` matches, reached through the
 * declaring module's `contributes[]` rather than by scanning every widget entry.
 * Going through the module is what makes two modules able to publish the same
 * `widgetName` without colliding.
 */
export declare function widgetContributionFor(key: WidgetKey, entries: readonly RegistryEntry[]): RegistryEntry | undefined;
export declare function createWidgetRegistry<TComponent>(input?: WidgetRegistryInput<TComponent>): WidgetRegistry<TComponent>;
export interface FlattenedRegistryEntries {
    entries: readonly RegistryEntry[];
    diagnostics: readonly SurfaceDiagnostic[];
}
/**
 * Registry documents → the flat entry list renderers take as a prop.
 *
 * The manifest admits an ARRAY of registries and the renderer prop is one flat
 * list, so two registries declaring the same `name` collapse. The spike's
 * `flatMap` kept both and let the renderer take whichever it found first — a
 * silent winner (gap ledger `registry-entries-wiring`).
 *
 * The rule stated here: **an ambiguous name resolves to no entry**, and one
 * `REGISTRY-ENTRY-NAME-COLLISION` names every declaring Registry. Picking the
 * first declaration would invent precedence the signed graph does not state
 * and let two processors render different widgets from the same bundle.
 */
export declare function flattenRegistryEntries(registries: readonly RegistryDocument[]): FlattenedRegistryEntries;
