import type { ComponentGraphProjectionContext } from './definition-source.ts';

export interface SurfaceRouteState {
  surfaceUrl: string;
  surfaceVersion?: string;
  routeId: string;
  nextRouteId?: string;
  triggerActionId?: string;
}

export interface SurfaceRouteActionResult {
  actionId: string;
  status: string;
  componentGraph: ComponentGraphProjectionContext | null | undefined;
}

export interface SurfaceRouter {
  transitionAfterResponseAction(result: SurfaceRouteActionResult): void;
}
