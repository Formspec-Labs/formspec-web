const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;
export function needTraceAttrs(candidates) {
    const anchors = (candidates ?? []).filter((candidate) => typeof candidate === 'string' && NEED_ANCHOR.test(candidate));
    if (anchors.length === 0)
        return {};
    const ids = anchors.flatMap((anchor) => {
        const match = NEED_ANCHOR.exec(anchor);
        return match?.[1] ? [match[1]] : [];
    });
    return {
        'data-need-anchors': [...new Set(anchors)].join(' '),
        'data-need-ids': [...new Set(ids)].join(' '),
    };
}
export function generationNeedAnchors(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
    const generation = value['x-generation'];
    if (!generation || typeof generation !== 'object' || Array.isArray(generation)) {
        return [];
    }
    const anchors = generation.anchors;
    return Array.isArray(anchors)
        ? anchors.filter((anchor) => typeof anchor === 'string')
        : [];
}
export function componentGraphIdentityAttrs(node) {
    const identity = node.componentGraphIdentity;
    if (!identity)
        return {};
    return {
        'data-formspec-component-handle': identity.component.handle,
        ...(identity.component.url ? { 'data-formspec-component-url': identity.component.url } : {}),
        ...(identity.component.version ? { 'data-formspec-component-version': identity.component.version } : {}),
        'data-formspec-surface-url': identity.surface.url,
        ...(identity.surface.version ? { 'data-formspec-surface-version': identity.surface.version } : {}),
        'data-formspec-route': identity.route,
        'data-formspec-node-path': identity.nodePath,
        ...(identity.id ? { 'data-formspec-component-node-id': identity.id } : {}),
        ...(identity.nodeId ? { 'data-formspec-component-node-structural-id': identity.nodeId } : {}),
    };
}
export function uiGraphRoutePolicyAttrs(node) {
    const policy = node.uiGraphRoutePolicy;
    if (!policy)
        return {};
    return {
        'data-formspec-ui-policy-schema': policy.schemaId,
        'data-formspec-ui-policy-source': policy.source,
        'data-formspec-ui-policy-surface-url': policy.targetSurface.url,
        ...(policy.targetSurface.version ? {
            'data-formspec-ui-policy-surface-version': policy.targetSurface.version,
        } : {}),
        'data-formspec-ui-policy-route': policy.routeId,
        ...(policy.a11y?.landmark ? {
            'data-formspec-ui-policy-a11y-landmark': policy.a11y.landmark,
        } : {}),
        ...(policy.a11y?.landmarkLabel ? {
            'data-formspec-ui-policy-a11y-landmark-label': policy.a11y.landmarkLabel,
        } : {}),
        ...(policy.a11y?.landmarkSuppressed ? {
            'data-formspec-ui-policy-a11y-landmark-suppressed': 'true',
        } : {}),
        ...(policy.a11y?.keyboardNavigation !== undefined ? {
            'data-formspec-ui-policy-keyboard-navigation': String(policy.a11y.keyboardNavigation),
        } : {}),
        ...(policy.responsive?.minColumns !== undefined ? {
            'data-formspec-ui-policy-responsive-min-columns': String(policy.responsive.minColumns),
        } : {}),
        ...(policy.responsive?.collapseOrder ? {
            'data-formspec-ui-policy-responsive-collapse-order': JSON.stringify(policy.responsive.collapseOrder),
        } : {}),
    };
}
export function projectionMetadataAttrs(node) {
    return {
        ...componentGraphIdentityAttrs(node),
        ...uiGraphRoutePolicyAttrs(node),
        ...needTraceAttrs(node.needAnchors),
    };
}
