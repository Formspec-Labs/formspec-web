import type { AdvanceTransition } from './SurfaceApp.js';
import type { NativeScreenerSlotProps, SurfaceScreenerCompletionPolicy } from './screener-completion.js';
import { type DataSourceRevisionSelector } from './data-source-revision.js';
import { type ReactNode } from 'react';
import { type ActionRefFinding, type FormEngineOptions, type IFormEngine } from '@formspec-org/engine';
import type { ResponseAction, ResponseActionInvocationResult, ResponseActionsDocument as ReactResponseActionsDocument, SemanticArtifactIdentity, SemanticControlRegistry, SemanticControlScope, SemanticResponseBinding, SubmitResult } from '@formspec-org/react';
import { type FormDefinition, type ComponentDocument, type LocaleDocument, type OntologyDocument, type ReferencesDocument, type ResponseActionsDocument as GeneratedResponseActionsDocument } from '@formspec-org/types';
import { type DataSourceAuthorizer, type DataSourceLoader, type DataSourceSelectionEvidence, type DataSourcePayloadValidator, type PlannedTransition, type SlotPlan, type SurfaceDiagnostic, type SurfaceSemanticOutputScope, type SurfaceStrings, type ThemeGrant } from '@formspec-org/surface';
import type { DraftSession } from './draft-session.js';
import type { DraftActionInvoker } from './draft-writer.js';
import { nextLevel } from './heading.js';
import { type FilingStatusViewContext } from './FilingStatus.js';
import type { SurfaceWidget, SurfaceWidgetActionExecutor, SurfaceWidgetActionDetail, SurfaceWidgetActionOutcomeStore, SurfaceWidgetActionReport, SurfaceWidgetRouteContext } from './widget-api.js';
import { type WidgetActionCoordinator } from './widget-action-runtime.js';
export type ResolvedDefinitionFormPlan = Extract<SlotPlan<SurfaceWidget>, {
    slotType: 'definition-form';
}> & {
    status: 'ready';
    definition: NonNullable<Extract<SlotPlan<SurfaceWidget>, {
        slotType: 'definition-form';
    }>['definition']>;
};
export type SurfaceSaveNotice = 'saved' | 'savedLocally' | 'saveFailed' | 'draftConflict' | 'draftLoaded' | 'submitted' | 'cleared';
export interface SurfaceFormSession {
    appearance: 'light' | 'dark';
    previewScope: string | undefined;
    entryPath?: string | undefined;
    navigate?: ((href: string) => void | boolean | Promise<boolean | void>) | undefined;
    drafts?: DraftSession | undefined;
    draftRevision?: number | undefined;
    reportSave: (notice: SurfaceSaveNotice) => void;
    workspace?: {
        slot: string | undefined;
        activeSection: string | undefined;
        focusField?: string | undefined;
        /** A group acknowledgement code a draft review route puts focus on, from its `acknowledge` link. */
        focusAcknowledgement?: string | undefined;
        hrefForSection: (slot: string, section: string) => string | undefined;
        onActiveSectionChange: (slot: string, section: string) => void;
        reportSectionTitle?: ((slot: string, title: string | undefined) => void) | undefined;
    } | undefined;
}
export interface SurfaceDefinitionFormRenderInput {
    plan: ResolvedDefinitionFormPlan;
    grant: ThemeGrant;
    route: SurfaceWidgetRouteContext;
    /** Resolved shell strings for the active locale. */
    strings: SurfaceStrings;
    /** The filing-unit type and typed keys, with the ID derived by Core in runtime WASM. */
    responseSubject?: (NonNullable<FormEngineOptions['responseSubject']> & {
        id: string;
    }) | undefined;
    responseActionsDocument: ReactResponseActionsDocument | undefined;
    referencesDocuments: readonly ReferencesDocument[];
    ontologyDocuments: readonly OntologyDocument[];
    /** Host-admitted Component from resolveDefinitionComponent for this Definition and route/slot. */
    componentDocument?: ComponentDocument | undefined;
    /** Host-admitted Locale documents; only matching Definition targets apply. */
    localeDocuments?: readonly LocaleDocument[] | undefined;
    activeLocale?: string | undefined;
    appearance?: 'light' | 'dark' | undefined;
    /** Exact local draft scope when the browser app is previewing an edition. */
    previewScope?: string | undefined;
    draftSession?: DraftSession | undefined;
    /** A new form still needs its authored seed. An existing draft has its own data. */
    draftSeed?: 'loading' | 'unavailable' | undefined;
    draftStrings?: SurfaceStrings | undefined;
    /** Report committed saves and failed writes to the single shell live region. */
    reportSave?: ((notice: SurfaceSaveNotice) => void) | undefined;
    /** Route navigation helpers for filed summaries, prerequisite notices, and submit confirmations. */
    navigate?: ((href: string) => void | boolean | Promise<boolean | void>) | undefined;
    formatHref?: ((href: string) => string | undefined) | undefined;
    overviewDestination?: string | undefined;
    reviewDestination?: string | undefined;
    /** The draft review route that accepts this form's group acknowledgements. */
    draftReviewDestination?: string | undefined;
    onDraftAvailabilityChange?: ((status: 'loading' | 'ready' | 'filed' | 'blocked' | undefined) => void) | undefined;
    activeSection?: string | undefined;
    focusField?: string | undefined;
    sectionNavigationActive?: boolean | undefined;
    hrefForSection?: ((section: string) => string | undefined) | undefined;
    onActiveSectionChange?: ((section: string) => void) | undefined;
    onSectionTitleChange?: ((title: string | undefined) => void) | undefined;
    /**
     * Data Source payload admitted before mount. Record identity, route/session
     * generation, and owner revision remain separate from Definition field data.
     */
    initialData?: SurfaceDefinitionFormInitialData | undefined;
    /** Exact runtime identity for generic semantic-control lookup, when admitted. */
    semanticControlScope?: SemanticControlScope | undefined;
    /** Receives every terminal from the mounted Definition Action control. */
    onDefinitionActionResult?: ((result: ResponseActionInvocationResult<SubmitResult>) => void) | undefined;
    /** Receives Response Actions resolution/invocation findings from the mounted Definition form or draft writer. */
    onActionFinding?: ((finding: ActionRefFinding) => void) | undefined;
    /**
     * Optional host executor for the selected Definition-scoped document. The
     * renderer still owns action resolution and submission; this port lets a
     * generic async Response Actions runtime perform declared durable effects.
     */
    responseActionInvoker?: DraftActionInvoker | undefined;
    /** Preserve the shell's completed-action navigation boundary. */
    onActionCompleted?: ((action: ResponseAction, result: ResponseActionInvocationResult<SubmitResult>) => void) | undefined;
}
export interface SurfaceDefinitionFormInitialData {
    data?: Readonly<Record<string, unknown>> | undefined;
    selection?: DataSourceSelectionEvidence | undefined;
    freshness: 'fresh' | 'stale';
    recordId?: string | undefined;
    generation?: string | number | undefined;
    revision?: string | number | undefined;
}
export type SurfaceDefinitionFormRenderer = (input: SurfaceDefinitionFormRenderInput) => ReactNode;
export interface SurfaceSemanticControlScopeRequest {
    plan: ResolvedDefinitionFormPlan;
    route: SurfaceWidgetRouteContext;
    responseActionsDocument: ReactResponseActionsDocument | undefined;
    runtimeGeneration: string | undefined;
}
/**
 * Host pairing for artifact digests and Response identity. The Surface shell
 * passes exact loaded objects and invents none of these facts.
 */
export type SurfaceSemanticControlScopeResolver = (request: SurfaceSemanticControlScopeRequest) => SemanticControlScope | undefined;
export interface SurfaceSemanticControlPairing {
    registry: SemanticControlRegistry;
    /** Exact loaded object identity to caller-computed canonical artifact facts. */
    definitionArtifacts: ReadonlyMap<FormDefinition, SemanticArtifactIdentity>;
    /** Exact loaded object identity to caller-computed canonical artifact facts. */
    responseActionsArtifacts: ReadonlyMap<ReactResponseActionsDocument, SemanticArtifactIdentity>;
    renderInstanceIdFor(request: SurfaceSemanticControlScopeRequest): string | undefined;
    responseBindingFor(request: SurfaceSemanticControlScopeRequest): SemanticResponseBinding | undefined;
}
/**
 * Build a fail-closed resolver from caller-paired object identities.
 * Canonicalization and digest computation stay outside the Surface renderer.
 */
export declare function createSurfaceSemanticControlScopeResolver(pairing: SurfaceSemanticControlPairing): SurfaceSemanticControlScopeResolver;
export interface SurfaceSlotProps {
    filingStatus?: FilingStatusViewContext | undefined;
    formSession?: SurfaceFormSession | undefined;
    activeSection?: string | undefined;
    focusField?: string | undefined;
    sectionNavigationActive?: boolean | undefined;
    localeDocuments?: readonly LocaleDocument[] | undefined;
    activeLocale?: string | undefined;
    screenerCompletion?: SurfaceScreenerCompletionPolicy | undefined;
    screenerInstanceId?: string | undefined;
    /** Pure destination check; required before host-required completion. */
    checkScreenerTarget?: ((target: string) => {
        status: 'accepted';
    } | {
        status: 'refused';
        reason: string;
    }) | undefined;
    onScreenerTarget?: NativeScreenerSlotProps['navigate'];
    plan: SlotPlan<SurfaceWidget>;
    grant: ThemeGrant;
    route: SurfaceWidgetRouteContext;
    /** The shell's own person-facing strings, host-overridable (§3.0). */
    strings: SurfaceStrings;
    dataSourceLoader?: DataSourceLoader | undefined;
    /** Pure per-source scheduling hints; evaluated on host renders, never authority. */
    dataSourceRevision?: DataSourceRevisionSelector | undefined;
    authorizeDataSource?: DataSourceAuthorizer | undefined;
    validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
    /** Shows the design rationale on `experience-unit` slots. Off for respondents. */
    showExperienceNeeds?: boolean | undefined;
    /**
     * The bundle's Response Actions document.
     *
     * `FormspecForm` injects a submit control ONLY when this publishes an Action
     * with `submit` intent — response-actions-spec §10 forbids implicit default
     * Actions, so a renderer that invented one would be wrong. Passing it is what
     * makes a form-bearing route able to fire its own transition.
     */
    responseActionsDocuments?: readonly GeneratedResponseActionsDocument[] | undefined;
    /** Manifested References documents; the default form shows human/both entries only. */
    referencesDocuments?: readonly ReferencesDocument[] | undefined;
    /** Manifested Ontology documents used for field semantics without exposing raw ids. */
    ontologyDocuments?: readonly OntologyDocument[] | undefined;
    transitions?: readonly PlannedTransition[] | undefined;
    widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
    widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
    widgetActionCoordinator?: WidgetActionCoordinator | undefined;
    /** Route + opaque session generation; late action completions cannot navigate across it. */
    runtimeGeneration?: string | undefined;
    onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
    onRuntimeDiagnosticsChange?: ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined;
    embedSlotPrefix?: string | undefined;
    onSlotFormEngineChange?: ((slotKey: string, engine: IFormEngine | undefined) => void) | undefined;
    onSlotVisibilityChange?: ((slotKey: string, nextRefs: ReadonlySet<string> | undefined, baselineKey: string) => void) | undefined;
    overviewDestination?: string | undefined;
    reviewDestination?: string | undefined;
    onSlotDraftAvailabilityChange?: ((slotId: string, status: 'loading' | 'ready' | 'filed' | 'blocked' | undefined) => void) | undefined;
    renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
    definitionActionInvoker?: DraftActionInvoker | undefined;
    resolveSemanticControlScope?: SurfaceSemanticControlScopeResolver | undefined;
    /** Exact caller-paired identity used only by renderers that publish output. */
    semanticOutputScope?: SurfaceSemanticOutputScope | undefined;
    onDefinitionActionResult?: ((result: ResponseActionInvocationResult<SubmitResult>) => void) | undefined;
    /** A published Action completed under its resolved validation policy. */
    onActionCompleted?: ((action: ResponseAction, result: ResponseActionInvocationResult<SubmitResult>) => void) | undefined;
    onAdvance?: AdvanceTransition | undefined;
}
/** The completed action whose declared policy permits route advancement. */
export declare function completedFormAction(result: ResponseActionInvocationResult<SubmitResult>): ResponseAction | undefined;
/** App actions need no Response; Response actions follow their resolved policy. */
export declare function completedWidgetAction(result: ResponseActionInvocationResult<SurfaceWidgetActionDetail>, document: GeneratedResponseActionsDocument): ResponseAction | undefined;
/**
 * True when the slot's own binding already produces the heading for its
 * content, so a slot-level title on top of it would be two headings for one
 * piece of content.
 *
 * Every other slot type — INCLUDING a `text`, `image` or `divider` static slot
 * — keeps its authored title. Dropping it for the whole slot type silently
 * threw away authored content: the spike bundle's `applyReassurance` slot is
 * `kind: text` titled "Before you start", and the title vanished.
 */
export declare function rendersOwnHeading(plan: SlotPlan<SurfaceWidget>): boolean;
/**
 * The wrapper every slot renders inside, at every nesting depth: the element,
 * the data attributes a probe reads, and the slot's own title at **the plan's**
 * heading level.
 *
 * `aria-label` is set only when the slot carries an authored title. Labelling a
 * region with a slot id turns machine vocabulary into something a screen reader
 * announces, and a `<section>` with no accessible name is inert rather than a
 * landmark — which is the honest shape for a slot the author did not name.
 */
export declare function SurfaceSlotFrame(props: SurfaceSlotProps): import("react/jsx-runtime").JSX.Element | null;
export declare function SurfaceSlot({ plan, filingStatus, grant, route, strings, dataSourceLoader, dataSourceRevision, authorizeDataSource, validateDataSourcePayload, showExperienceNeeds, responseActionsDocuments, referencesDocuments, ontologyDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, embedSlotPrefix, onSlotFormEngineChange, onSlotVisibilityChange, overviewDestination, reviewDestination, onSlotDraftAvailabilityChange, renderDefinitionForm, definitionActionInvoker, resolveSemanticControlScope, semanticOutputScope, onDefinitionActionResult, onActionCompleted, onAdvance, onScreenerTarget, checkScreenerTarget, screenerInstanceId, screenerCompletion, localeDocuments, activeLocale, formSession, activeSection, focusField, sectionNavigationActive, }: SurfaceSlotProps): ReactNode;
export declare function renderDefaultDefinitionForm(input: SurfaceDefinitionFormRenderInput): ReactNode;
export { nextLevel };
