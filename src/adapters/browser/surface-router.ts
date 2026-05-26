import type {
  SurfaceRouteActionResult,
  SurfaceRouteState,
  SurfaceRouter,
} from '../../ports/surface-router.ts';

export function createBrowserSurfaceRouter(state: SurfaceRouteState): SurfaceRouter {
  return {
    transitionAfterResponseAction(result) {
      if (result.status !== 'completed' || !state.nextRouteId) return;
      if (!state.triggerActionId || result.actionId !== state.triggerActionId) return;
      if (!componentGraphMatchesState(result, state)) return;
      const current = new URL(window.location.href);
      current.searchParams.set('surfaceRoute', state.nextRouteId);
      current.searchParams.delete('surfaceNextRoute');
      current.searchParams.delete('surfaceTriggerAction');
      window.history.replaceState(
        {
          formspecInternalSurfaceRoute: true,
          formspecSurface: state.surfaceUrl,
          formspecSurfaceVersion: state.surfaceVersion,
          formspecFromRoute: state.routeId,
          formspecRoute: state.nextRouteId,
          formspecTriggerAction: state.triggerActionId,
        },
        '',
        `${current.pathname}${current.search}${current.hash}`,
      );
    },
  };
}

function componentGraphMatchesState(
  result: SurfaceRouteActionResult,
  state: SurfaceRouteState,
): boolean {
  const graph = result.componentGraph;
  if (!graph) return false;
  if (graph.surface.url !== state.surfaceUrl) return false;
  if ((graph.surface.version ?? undefined) !== (state.surfaceVersion ?? undefined)) return false;
  return graph.route === state.routeId;
}
