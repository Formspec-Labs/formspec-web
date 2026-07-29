/**
 * @filedesc `SurfaceSlot` — one planned slot, rendered — and `SurfaceSlotFrame`,
 * the ONE place a slot's own title becomes a heading.
 *
 * The dispatch already happened: `@formspec-org/surface`'s `planRoute` turned a
 * `slotType` into a typed `SlotPlan`, exhaustively and without React in scope.
 * This file binds each plan variant to elements and nothing else, which is why
 * a second renderer (web component, server-side) needs a file this size rather
 * than a re-implementation of the taxonomy.
 *
 * ## Why the frame is a component and not two inline expressions
 *
 * `surface-shell-spec.md` §8.3 item 10: "Where a decision — whether to render a
 * slot's own title, which level a title takes — is made in more than one code
 * path, those paths MUST agree; divergent duplicates of the same rule are how a
 * fixed defect reappears one nesting level down." It did: the top-level path
 * suppressed a slot title only for `kind: heading`, and the embed path
 * suppressed it for **all** `static-content` kinds, throwing away the authored
 * title of every `text`, `image` and `divider` slot inside an embed — the exact
 * bug the top-level path had already been fixed to remove. The embed path also
 * rendered the title at the HOST slot's base rather than the child's, so an
 * embedded title sat at the same rank as its host while its content sat one
 * deeper. {@link SurfaceSlotFrame} is both paths now.
 */
import { type ReactNode } from 'react';
import type { ResponseAction, ResponseActionInvocationResult, ResponseActionsDocument as ReactResponseActionsDocument, SubmitResult } from '@formspec-org/react';
import type { ResponseActionsDocument as GeneratedResponseActionsDocument } from '@formspec-org/types';
import { type DataSourceAuthorizer, type DataSourceLoader, type DataSourcePayloadValidator, type PlannedTransition, type SlotPlan, type SurfaceDiagnostic, type SurfaceStrings, type ThemeGrant } from '@formspec-org/surface';
import { nextLevel } from './heading.js';
import type { SurfaceWidget, SurfaceWidgetActionExecutor, SurfaceWidgetActionOutcomeStore, SurfaceWidgetActionReport, SurfaceWidgetRouteContext } from './widget-api.js';
import { type WidgetActionCoordinator } from './widget-action-runtime.js';
export type ResolvedDefinitionFormPlan = Extract<SlotPlan<SurfaceWidget>, {
    slotType: 'definition-form';
}> & {
    status: 'ready';
    definition: NonNullable<Extract<SlotPlan<SurfaceWidget>, {
        slotType: 'definition-form';
    }>['definition']>;
};
export interface SurfaceDefinitionFormRenderInput {
    plan: ResolvedDefinitionFormPlan;
    grant: ThemeGrant;
    route: SurfaceWidgetRouteContext;
    responseActionsDocument: ReactResponseActionsDocument | undefined;
    /** Preserve the shell's completed-action navigation boundary. */
    onActionCompleted?: ((action: ResponseAction) => void) | undefined;
}
export type SurfaceDefinitionFormRenderer = (input: SurfaceDefinitionFormRenderInput) => ReactNode;
export interface SurfaceSlotProps {
    plan: SlotPlan<SurfaceWidget>;
    grant: ThemeGrant;
    route: SurfaceWidgetRouteContext;
    /** The shell's own person-facing strings, host-overridable (§3.0). */
    strings: SurfaceStrings;
    dataSourceLoader?: DataSourceLoader | undefined;
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
    transitions?: readonly PlannedTransition[] | undefined;
    widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
    widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
    widgetActionCoordinator?: WidgetActionCoordinator | undefined;
    /** Route + opaque session generation; late action completions cannot navigate across it. */
    runtimeGeneration?: string | undefined;
    onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
    onRuntimeDiagnosticsChange?: ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined;
    renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
    /** A published Action reached a successful terminal with a valid report. */
    onActionCompleted?: ((action: ResponseAction) => void) | undefined;
    onAdvance?: ((transition: PlannedTransition) => void) | undefined;
}
/** The action that is safe to use for route advancement, or no action. */
export declare function completedFormAction(result: ResponseActionInvocationResult<SubmitResult>): ResponseAction | undefined;
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
export declare function SurfaceSlotFrame(props: SurfaceSlotProps): import("react/jsx-runtime").JSX.Element;
export declare function SurfaceSlot({ plan, grant, route, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, showExperienceNeeds, responseActionsDocuments, transitions, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, onActionCompleted, onAdvance, }: SurfaceSlotProps): ReactNode;
export declare function renderDefaultDefinitionForm({ plan, grant, responseActionsDocument, onActionCompleted, }: SurfaceDefinitionFormRenderInput): ReactNode;
export { nextLevel };
