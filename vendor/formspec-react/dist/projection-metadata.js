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
    };
}
