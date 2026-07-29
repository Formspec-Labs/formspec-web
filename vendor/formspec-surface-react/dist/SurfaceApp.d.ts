/**
 * @filedesc `SurfaceApp` — a bundle's Surfaces, running.
 *
 * This is the piece that did not exist. Every `SurfaceDocument` consumer in the
 * stack was authoring-side (`studio-core`'s kernel, the MCP wireframe verbs) or
 * validation-side (the app-graph validator, `formspec-lint`); the one
 * rendering-adjacent consumer never opened a Surface document at all. So the
 * closed slot taxonomy, the route-class vocabulary, the route graph and the
 * transition triggers were authored, enforced, and read by nothing at render
 * time.
 *
 * ## Every diagnostic reaches the host, whatever stage produced it
 *
 * `surface-shell-spec.md` §7.1. This component previously aggregated only the
 * bundle, composition, registry and theme-construction diagnostics; the route
 * plan and the transition plan were computed inside a child and their
 * diagnostics **discarded**, so `SLOT-BINDING-INCOMPLETE`,
 * `STATIC-IMAGE-NO-ALT`, `EMBED-ROUTE-*`, `WIDGET-*`, per-slot
 * `BUNDLE-DOCUMENT-MISSING` and every `TRANSITION-UNFIREABLE` reached the
 * screen and never `onDiagnostics`. Per-route stages produce most of the code
 * set, so that delivered the minority of it.
 *
 * The fix is structural rather than an extra call: `planMatchedRoute` composes
 * the grant, the slot plan and the transition plan in the core and returns one
 * diagnostic list, and this component unions it with the app-construction list
 * and the route-resolution list in one memo. There is no second place a
 * diagnostic could be computed and dropped.
 *
 * ## Composition order, and why the theme authority is built first
 *
 * {@link useSurfaceApp} builds the theme authority **once, from the bundle**, and
 * hands back a `grantFor` that is the only route into the tenant Theme. The
 * tenant Theme is never a prop of anything below this line, so a slot renderer
 * cannot reach it by accident and a future prop cannot restore it by mistake.
 * That is the structural half of THEME-ROUTE-CLASS.
 *
 * ## Navigation is a port, not a router
 *
 * `location` and `onNavigate` are props. This package ships
 * {@link useBrowserLocation} for hosts that want the address bar, and stays out
 * of the way of hosts that already have a router — which every host of any size
 * does. A shell that owned history would be a shell that could not be embedded.
 */
import { type ReactNode } from 'react';
import { type DataSourceAuthorizer, type DataSourceLoader, type DataSourcePayloadValidator, type HeadingLevel, type PlannedTransition, type ResolvedBundle, type SurfaceApp as ComposedSurfaceApp, type SurfaceCompositionOptions, type SurfaceDiagnostic, type SurfaceRouteHandle, type SurfaceStringOverrides, type SurfaceStrings, type SurfaceStaticAssetResolver, type ThemeAuthority, type TransitionConditionEvaluator, type WidgetRegistry } from '@formspec-org/surface';
import type { RegistryEntry } from '@formspec-org/types';
import type { SurfaceWidget, SurfaceWidgetActionExecutor, SurfaceWidgetActionOutcomeStore, SurfaceWidgetActionReport, SurfaceWidgetModule } from './widget-api.js';
import type { SurfaceDefinitionFormRenderer } from './SurfaceSlot.js';
export type FireTransition = (transition: PlannedTransition, from: SurfaceRouteHandle) => Promise<{
    advanced: boolean;
    reason?: string;
}>;
/**
 * Final navigation boundary after a Response Action reports completion.
 *
 * Planning already withholds collision- and parameter-refused transitions.
 * This rechecks the target so a future binding path, stale plan, or adversarial
 * completed-action report still cannot publish an unusable address.
 */
export declare function navigateAfterCompletedAction(transition: PlannedTransition, routeParams: Readonly<Record<string, string>>, onNavigate: (href: string) => void): 'advanced' | 'refused';
export interface UseSurfaceAppInput {
    bundle: ResolvedBundle;
    widgetModules?: readonly SurfaceWidgetModule[] | undefined;
    /** Host-supplied navigation labels. See `composeSurfaceApp`. */
    surfaceLabel?: SurfaceCompositionOptions['surfaceLabel'] | undefined;
    /** Host-supplied token aliases. Not a platform rule — see `createThemeAuthority`. */
    tokenAliases?: Readonly<Record<string, readonly string[]>> | undefined;
}
export interface SurfaceAppModel {
    app: ComposedSurfaceApp;
    themeAuthority: ThemeAuthority;
    widgets: WidgetRegistry<SurfaceWidget>;
    registryEntries: readonly RegistryEntry[];
    /** Bundle, composition, registry and theme-construction diagnostics only. */
    diagnostics: readonly SurfaceDiagnostic[];
}
export declare function useSurfaceApp(input: UseSurfaceAppInput): SurfaceAppModel;
export interface SurfaceAppProps extends UseSurfaceAppInput {
    /** Current path, e.g. `window.location.pathname`. */
    location: string;
    onNavigate: (href: string) => void;
    /**
     * Values for route parameters, so parameterised routes can be linked.
     *
     * The shell does not invent these. A bundle with no submission has no case
     * reference, and a nav link to `/receipt/{caseRef}` with nothing to put in it
     * raises `ROUTE-PARAM-UNSUPPLIED` rather than quietly linking nowhere.
     */
    routeParams?: Readonly<Record<string, string>> | undefined;
    /** Canonical Data Sources payload port; receives exact resolved descriptors. */
    dataSourceLoader?: DataSourceLoader | undefined;
    /** Host admission verdict applied before every data load. */
    authorizeDataSource?: DataSourceAuthorizer | undefined;
    /** Required when a bound source declares a payload schema. */
    validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
    /** Adapter to the existing Response Actions executor for widget outputs. */
    widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
    /** Optional durable replay store for completed widget action invocations. */
    widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
    /** Opaque host generation marker; changing it invalidates late navigation. */
    sessionGeneration?: string | number | undefined;
    onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
    /** Host form runtime seam; the current `FormspecForm` remains the default. */
    renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
    /**
     * Admits or refuses each authored static image source before rendering.
     * Without this host resolver, image slots remain unavailable.
     */
    staticAssetResolver?: SurfaceStaticAssetResolver | undefined;
    /**
     * Runs a transition's action under Response Actions authority. Absent ⇒ no
     * transition renders a control. See `SurfaceTransitions`.
     */
    onFireTransition?: FireTransition | undefined;
    /** Evaluates transition `when` expressions against validated bundle state. */
    evaluateTransitionCondition?: TransitionConditionEvaluator | undefined;
    showExperienceNeeds?: boolean | undefined;
    /** Shows the theme-posture sentence on the page. Default false (§4.3.1). */
    showThemeNotice?: boolean | undefined;
    /**
     * Level route content starts at. Default 2 — the route title is the page's
     * single `h1`. A host whose own chrome already owns the page heading passes
     * `1`, and the shell offsets from it and renders no title heading of its own
     * (§3.4.1 obligation 3). A shell that hard-codes the outline cannot be
     * embedded.
     */
    headingBaseLevel?: HeadingLevel | undefined;
    /**
     * Overrides for the shell's own person-facing strings — the enumerable,
     * closed set in `@formspec-org/surface`'s `strings.ts` (§3.0). This is the
     * seam finding F7 lands on; it is not localisation.
     */
    strings?: SurfaceStrings | SurfaceStringOverrides | undefined;
    /**
     * Sets `document.title` from the bundle, and **restores the previous title on
     * unmount**. Default true.
     *
     * The cleanup is the point: §8.3 item 9 requires a binding to clean up any
     * document-level state it sets, "including the document title. A binding that
     * scopes its tokens and then writes an uncleaned global elsewhere has applied
     * the rule to one channel and not the principle."
     */
    setDocumentTitle?: boolean | undefined;
    /** Above the navigation — verification chrome, tenant header, whatever the host has. */
    header?: ReactNode;
    footer?: ReactNode;
    navigationLabel?: string | undefined;
    renderNotFound?: ((location: string) => ReactNode) | undefined;
    /**
     * Called with EVERY diagnostic — bundle, composition, registry, theme, route
     * resolution, slot planning, theme grant, transition planning, and the
     * document-root observation — once on subscription and after each semantic
     * change. Equivalent object identities and callback replacement do not
     * replay the list.
     */
    onDiagnostics?: ((diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined;
}
export declare function SurfaceApp(props: SurfaceAppProps): import("react/jsx-runtime").JSX.Element;
export interface SurfaceNavProps {
    app: ComposedSurfaceApp;
    location: string;
    routeParams?: Readonly<Record<string, string>> | undefined;
    /**
     * Receives only usable destinations. Collision claimants and routes missing
     * parameter values render as unavailable text with no link or click handler.
     */
    onNavigate: (href: string) => void;
    label?: string | undefined;
}
export declare function SurfaceNav({ app, location, routeParams, onNavigate, label }: SurfaceNavProps): import("react/jsx-runtime").JSX.Element;
/**
 * Address-bar location plus a navigate function, for hosts with no router.
 *
 * Deliberately minimal — `pushState` + `popstate`. A host with a real router
 * passes its own `location`/`onNavigate` and never calls this.
 */
export declare function useBrowserLocation(fallback?: string): [string, (href: string) => void];
