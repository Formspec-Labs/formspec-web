import { type DataSourceAuthorizer, type DataSourceLoader, type DataSourcePayloadValidator, type PlannedTransition, type SurfaceDiagnostic, type SurfaceRoutePlan, type SurfaceStrings } from '@formspec-org/surface';
import type { ResponseActionsDocument } from '@formspec-org/types';
import { type SurfaceDefinitionFormRenderer } from './SurfaceSlot.js';
import type { SurfaceWidget, SurfaceWidgetActionExecutor, SurfaceWidgetActionOutcomeStore, SurfaceWidgetActionReport } from './widget-api.js';
import type { WidgetActionCoordinator } from './widget-action-runtime.js';
export interface SurfaceRouteViewProps {
    /** Everything the core decided for this route. Nothing here re-decides it. */
    plan: SurfaceRoutePlan<SurfaceWidget>;
    /** The shell's own person-facing strings. Defaults to the shipped English. */
    strings?: SurfaceStrings | undefined;
    dataSourceLoader?: DataSourceLoader | undefined;
    authorizeDataSource?: DataSourceAuthorizer | undefined;
    validateDataSourcePayload?: DataSourcePayloadValidator | undefined;
    widgetActionExecutor?: SurfaceWidgetActionExecutor | undefined;
    widgetActionOutcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
    widgetActionCoordinator?: WidgetActionCoordinator | undefined;
    runtimeGeneration?: string | undefined;
    onWidgetActionReport?: ((report: SurfaceWidgetActionReport) => void) | undefined;
    onRuntimeDiagnosticsChange?: ((scope: string, diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined;
    renderDefinitionForm?: SurfaceDefinitionFormRenderer | undefined;
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
    /** Runs a transition's action under Response Actions authority. */
    onFireTransition?: ((transition: PlannedTransition, from: SurfaceRoutePlan<SurfaceWidget>['handle']) => Promise<{
        advanced: boolean;
        reason?: string;
    }>) | undefined;
    /**
     * Called when a transition has actually completed under Response Actions
     * authority — never on a click. The shell navigates; it does not decide that
     * the action succeeded.
     */
    onAdvance?: ((transition: PlannedTransition) => void) | undefined;
}
export declare function SurfaceRouteView({ plan, strings, dataSourceLoader, authorizeDataSource, validateDataSourcePayload, widgetActionExecutor, widgetActionOutcomeStore, widgetActionCoordinator, runtimeGeneration, onWidgetActionReport, onRuntimeDiagnosticsChange, renderDefinitionForm, showExperienceNeeds, showThemeNotice, responseActionsDocuments, onFireTransition, onAdvance, }: SurfaceRouteViewProps): import("react/jsx-runtime").JSX.Element;
