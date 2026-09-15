/**
 * @filedesc `@formspec-org/surface-react` — the React binding for the Surface shell.
 *
 * `@formspec-org/surface` plans; this renders. The split is the same one
 * `formspec-react` and `formspec-webcomponent` already have, and it exists for
 * the same reason: the slot taxonomy, the route graph and the theme boundary are
 * not React facts, and a second renderer must not have to re-derive them.
 */
export { SurfaceApp, SurfaceNav, useBrowserLocation, useSurfaceApp, } from './SurfaceApp.js';
export { SurfaceRouteView } from './SurfaceRoute.js';
export { createSurfaceSemanticOutputScopeResolver, surfaceSemanticOutputSubjectRef, useSurfaceSemanticOutputs, } from './semantic-output.js';
export { SurfaceSlot, SurfaceSlotFrame, completedWidgetAction, createSurfaceSemanticControlScopeResolver, renderDefaultDefinitionForm, rendersOwnHeading, } from './SurfaceSlot.js';
export { SurfaceTransitions } from './SurfaceTransitions.js';
export { Heading, nextLevel } from './heading.js';
export { MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES, ModuleWidgetStateView, widgetDataMatchesEmptyWhen, } from './widget-state.js';
export { allocateWidgetActionInvocationId, admitSurfaceWidgetActionInput, createWidgetActionCoordinator, createWidgetActionDelivery, normalizeWidgetActionResult, responseActionsDocumentForAction, } from './widget-action-runtime.js';
export { CeremonyFrame, CEREMONY_FRAME_DELIVERY_CONTRACT_ID, CEREMONY_FRAME_RENDERED_CONFIG_NODES, IntakeBanner, QUEUE_TABLE_DELIVERY_CONTRACT_ID, QUEUE_TABLE_RENDERED_CONFIG_NODES, QueueTable, RECEIPT_PANEL_DELIVERY_CONTRACT_ID, RECEIPT_PANEL_RENDERED_CONFIG_NODES, ReceiptPanel, StructuredPanel, STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, STRUCTURED_PANEL_RENDERED_CONFIG_NODES, STARTER_WIDGETS, WidgetEmptyState, readStructuredPanelPath, starterWidgetModule, } from './widgets/index.js';
export { executeBrowserResourceEffect, resolveBrowserResourceCommand, } from './browser-resource.js';
