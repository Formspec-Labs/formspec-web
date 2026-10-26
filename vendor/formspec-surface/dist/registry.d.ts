/**
 * @filedesc The module-widget runtime seam: `{moduleId, widgetName}` → a component.
 *
 * ## What the platform already had, and what it did not
 *
 * The Registry declares a widget's name, version, status, `childrenPolicy` and
 * `tokenSlots`; the ModuleResolver admits it; lint E603 checks the module is
 * declared; the UI Graph Policy validator reasons about its theming. All of that
 * is admission. **Nothing delivered.** A module could declare a widget it had no
 * way to ship (gap ledger `module-widget-runtime`).
 *
 * This module is the delivery channel: a host registers {@link WidgetModule}s,
 * and a `module-widget` binding resolves through the same identity the Registry
 * already uses. It is generic over the component type so the renderer-independent
 * core owns the lookup and each renderer binding owns only its component shape —
 * the same split `formspec-react` and `formspec-webcomponent` already have.
 *
 * ## Three fields called `widgetName`, and only one of them is this one
 *
 * ADR 0160 §2.4 (with the residual named in §8.1). Conflating these is the
 * defect the ADR spent a section not closing, so it is worth the four lines:
 *
 * | Field | Vocabulary | Pattern |
 * |---|---|---|
 * | `RegistryEntry.name` | globally unique contribution id | `^x-[a-z][a-z0-9]*(-…)*$` |
 * | `RegistryEntry.widgetShape.widgetName` | the module's own widget name | **none** — often PascalCase |
 * | Theme `widget` (`common.schema.json` `CustomWidgetName`) | a third | `^x-[A-Za-z0-9][A-Za-z0-9_.-]*$` |
 *
 * A Surface `module-widget` binding's `widgetName` is the **second** — the
 * schema documents it as "matches `widgetShape.widgetName`" and carries no
 * pattern. So {@link createWidgetRegistry} keys its lookup on
 * `widgetShape.widgetName` within the module's `contributes[]`, through the
 * shared `resolveWidgetContribution` helper from `@formspec-org/app-graph`,
 * and reports the contribution id separately. A registry keyed on
 * `RegistryEntry.name` would resolve nothing the day a module uses a
 * PascalCase widget name — which the schema explicitly permits.
 */
import { widgetContractMismatchReasons, type WidgetRenderedConfigNodeContract, type WidgetRuntimeContract } from '@formspec-org/app-graph';
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
    /**
     * Renderer-owned delivery declarations keyed by widgetShape.widgetName.
     *
     * A Registry widget that publishes a deliveryContractId or rendered-node
     * inventory is admitted only when the supplied component publishes the exact
     * same declaration and Registry entry version.
     */
    contracts?: Readonly<Record<string, WidgetRuntimeContract>>;
}
/** Owned by `@formspec-org/app-graph`, which compares it at authoring time too. */
export type { WidgetRenderedConfigNodeContract, WidgetRuntimeContract };
/** The one comparison, shared with the authoring host check; see `@formspec-org/app-graph`. */
export { widgetContractMismatchReasons };
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
    /** Code exists, but it does not match the Registry contract it claims to implement. */
    status: 'incompatible';
    contributionName: string;
    entry: RegistryEntry;
    reasons: readonly string[];
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
