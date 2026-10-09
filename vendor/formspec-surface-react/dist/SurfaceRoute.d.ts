/**
 * @filedesc `SurfaceRouteView` — one route plan, rendered, with its theme
 * boundary.
 *
 * It takes a `SurfaceRoutePlan` and re-derives nothing in it: not the route
 * match, not the theme grant, not the slot dispatch, not the heading level, not
 * the transition state (`surface-shell-spec.md` §8.3 item 1). Three things
 * happen here and nowhere else:
 *
 * 1. **The route title takes the level the composition assigns.** At the
 *    default baseline of 2 it is the page's single `h1`. A host that owns the
 *    page heading passes `headingBaseLevel: 1`, and this renders no title
 *    heading at all rather than a second `h1` under the host's — the shell
 *    honours the baseline it was given (§3.4.1 obligation 3). The level comes
 *    from `resolveRouteTitleLevel` in the core, so this file decides nothing
 *    about the outline.
 *
 * 2. **The grant's tokens are emitted on THIS element, with cleanup** (TB-2).
 *    Scoped, not global. `emitMergedThemeCssVars` is the same helper
 *    `FormspecForm` uses on its own container, used the same correct way:
 *    written on mount, removed on unmount, never on `document.documentElement`.
 *    A refusing route therefore carries the platform values and a branded route
 *    carries the tenant's, and navigating between them leaves no residue.
 *
 *    Deliberately NOT paired with a document-root scrub. A shell that scrubbed
 *    would be manufacturing the property it claims to hold, which is not a
 *    measurement of anything (§4.5). `SurfaceApp` READS the root and reports
 *    `THEME-DOCUMENT-ROOT-CONTAMINATED` instead.
 *
 * 3. **Slots render in authored order.** `slot.position` is an author hint that
 *    v0.1 explicitly gives "no normative position vocabulary", so honouring it
 *    would mean inventing one. Authored order is the only thing defined.
 */
import { type SurfaceRouteTitleResolver } from './title-presentation.js';
import type { DataSourceRevisionSelector } from './data-source-revision.js';
import { type DataSourceAuthorizer, type DataSourceLoader, type DataSourcePayloadValidator, type PlannedTransition, type SurfaceDiagnostic, type SurfaceRoutePlan, type SurfaceStrings } from '@formspec-org/surface';
import type { OntologyDocument, LocaleDocument, ReferencesDocument, ResponseActionsDocument } from '@formspec-org/types';
import { type SurfaceDefinitionFormRenderInput, type SurfaceDefinitionFormRenderer, type SurfaceSemanticControlScopeResolver } from './SurfaceSlot.js';
import type { FireTransition, SurfaceTransitionOutcome } from './SurfaceApp.js';
import type { SurfaceWidget, SurfaceWidgetActionExecutor, SurfaceWidgetActionOutcomeStore, SurfaceWidgetActionReport } from './widget-api.js';
import type { SurfaceSemanticOutputScopeResolver } from './semantic-output.js';
import type { WidgetActionCoordinator } from './widget-action-runtime.js';
export interface SurfaceRouteViewProps {
    localeDocuments?: readonly LocaleDocument[] | undefined;
    activeLocale?: string | undefined;
    screenerInstanceId?: string | undefined;
    onScreenerTarget?: ((target: string) => {
        status: 'accepted';
    } | {
        status: 'refused';
        reason: string;
    }) | undefined;
    /** Everything the core decided for this route. Nothing here re-decides it. */
    plan: SurfaceRoutePlan<SurfaceWidget>;
    resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
    /** The shell's own person-facing strings. Defaults to the shipped English. */
    strings?: SurfaceStrings | undefined;
    dataSourceLoader?: DataSourceLoader | undefined;
    /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
    dataSourceRevision?: DataSourceRevisionSelector | undefined;
    authorizeDataSource?: DataSourceAuthorizer | undefined;
    validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
    widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
    widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
    widgetActionCoordinator?: WidgetActionCoordinator | undefined;
    runtimeGeneration?: string | undefined;
    onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
    onRuntimeDiagnosticsChange?: ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined;
    renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
    definitionActionInvoker?: SurfaceDefinitionFormRenderInput['responseActionInvoker'] | undefined;
    resolveSemanticControlScope?: SurfaceSemanticControlScopeResolver | undefined;
    resolveSemanticOutputScope?: SurfaceSemanticOutputScopeResolver | undefined;
    onDefinitionActionResult?: SurfaceDefinitionFormRenderInput['onDefinitionActionResult'] | undefined;
    showExperienceNeeds?: boolean | undefined;
    /**
     * Shows the theme-posture sentence on the page. **Default false** (§4.3.1):
     * on an admitting route it carries no information, and on any route it is
     * chrome the bundle did not author appearing above content that was signed.
     * A host that wants the refusal visible — and there is a real trust argument
     * for showing it on `proof` and `ceremony` routes — opts in.
     */
    showThemeNotice?: boolean | undefined;
    /** The Response Actions document a `definition-form` slot runs its actions under. */
    responseActionsDocuments?: readonly ResponseActionsDocument[] | undefined;
    /** Manifested References documents available to matching Definition forms. */
    referencesDocuments?: readonly ReferencesDocument[] | undefined;
    /** Manifested Ontology documents available to matching Definition forms. */
    ontologyDocuments?: readonly OntologyDocument[] | undefined;
    /** Runs a transition's action under Response Actions authority. */
    onFireTransition?: FireTransition | undefined;
    /**
     * Called when a transition has actually completed under Response Actions
     * authority — never on a click. The shell navigates; it does not decide that
     * the action succeeded.
     */
    onAdvance?: ((transition: PlannedTransition, outcome?: Pick<SurfaceTransitionOutcome, 'transitionBindings'>) => 'advanced' | 'refused' | void) | undefined;
}
export declare function SurfaceRouteView({ plan, resolveRouteTitle, strings, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, resolveSemanticOutputScope, onDefinitionActionResult, showExperienceNeeds, showThemeNotice, responseActionsDocuments, referencesDocuments, ontologyDocuments, onFireTransition, onAdvance, onScreenerTarget, screenerInstanceId, localeDocuments, activeLocale, }: SurfaceRouteViewProps): import("react/jsx-runtime").JSX.Element;
