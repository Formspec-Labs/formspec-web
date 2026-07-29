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
export { SurfaceSlot, SurfaceSlotFrame, renderDefaultDefinitionForm, rendersOwnHeading, } from './SurfaceSlot.js';
export { SurfaceTransitions } from './SurfaceTransitions.js';
export { Heading, nextLevel } from './heading.js';
export { allocateWidgetActionInvocationId, createWidgetActionCoordinator, createWidgetActionDelivery, normalizeWidgetActionResult, responseActionsDocumentForAction, } from './widget-action-runtime.js';
export { CeremonyFrame, IntakeBanner, QueueTable, ReceiptPanel, STARTER_WIDGETS, WidgetEmptyState, starterWidgetModule, } from './widgets/index.js';
