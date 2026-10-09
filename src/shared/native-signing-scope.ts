import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react/widget-metadata';

/** Deployment selection; admission below proves the authored identities. */
export interface NativeSigningScopeSelection {
  surface: { url: string; version: string };
  route: string;
  ceremonySlot: string;
  reviewSlot: string;
}
export interface NativeSigningScopeIdentity extends NativeSigningScopeSelection {
  surfaceId: string;
  moduleId: string;
}

/** Resolve once, before credentials; omission retains the original package-wide checks. */
export function admitNativeSigningScope(bundle: BundleExport, moduleId: string, selection?: NativeSigningScopeSelection) {
  if (!selection) return undefined;
  const resolved = dereferenceBundleExport(bundle);
  const references = bundle.manifest.surfaces?.filter(ref => ref.url === selection.surface.url) ?? [];
  const surfaces = resolved.surfaces.filter(surface => resolved.surfaceRefs?.get(surface) === selection.surface.url);
  if (references.length !== 1 || references[0].version !== selection.surface.version || surfaces.length !== 1) {
    throw new Error('Native signing Surface selection is unavailable or ambiguous');
  }
  const surface = surfaces[0];
  const routes = surface.routes.filter(route => route.id === selection.route);
  if (routes.length !== 1 || routes[0].routeClass !== 'ceremony' || selection.ceremonySlot === selection.reviewSlot) {
    throw new Error('Native signing route selection is unavailable or ambiguous');
  }
  const route = routes[0];
  const select = (id: string, widgetName: string) => {
    const slots = (route.slots ?? []).filter(slot => slot.id === id);
    const slot = slots[0];
    const binding = slot?.binding as Record<string, unknown> | undefined;
    if (slots.length !== 1 || slot.slotType !== 'module-widget'
      || binding?.moduleId !== moduleId || binding?.widgetName !== widgetName) {
      throw new Error('Native signing slot selection is unavailable or ambiguous');
    }
    return slot;
  };
  const ceremony = select(selection.ceremonySlot, SIGNING_CEREMONY_WIDGET_SHAPE.widgetName);
  const review = select(selection.reviewSlot, RESPONSE_REVIEW_WIDGET_SHAPE.widgetName);
  const identity: NativeSigningScopeIdentity = Object.freeze({ ...structuredClone(selection),
    surface: Object.freeze({ ...selection.surface }), surfaceId: surface.id, moduleId });
  return { identity, surface, route, ceremony, review };
}

export function signingScopeAllows(scope: NativeSigningScopeIdentity, context: {
  surfaceId: string; surfaceRef?: string; routeId: string; slotId: string; moduleId?: string; widgetName?: string;
}) {
  return context.surfaceId === scope.surfaceId && context.surfaceRef === scope.surface.url
    && context.routeId === scope.route && context.moduleId === scope.moduleId
    && (context.slotId === scope.ceremonySlot && context.widgetName === SIGNING_CEREMONY_WIDGET_SHAPE.widgetName
      || context.slotId === scope.reviewSlot && context.widgetName === RESPONSE_REVIEW_WIDGET_SHAPE.widgetName);
}

/** Resolve mappings within the selected ceremony; legacy admission scans the complete package. */
export function nativeSigningActionMappings(resolved: ReturnType<typeof dereferenceBundleExport>, actionRef: string,
  scope?: NativeSigningScopeIdentity) {
  return resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => (route.slots ?? []).flatMap(slot => {
    if (slot.slotType !== 'module-widget') return [];
    const binding = slot.binding as Record<string, unknown>;
    if (scope && (!signingScopeAllows(scope, { surfaceId: surface.id, surfaceRef: resolved.surfaceRefs?.get(surface),
      routeId: route.id, slotId: slot.id, moduleId: binding.moduleId as string, widgetName: binding.widgetName as string })
      || slot.id !== scope.ceremonySlot)) return [];
    const mappings = binding.actionBindings;
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) return [];
    return Object.entries(mappings).flatMap(([outputName, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const mapping = value as Record<string, unknown>;
      return mapping.actionRef === actionRef ? [{ surface, route, slot, outputName, mapping }] : [];
    });
  })));
}
