/** Finding identity excludes presentation text and other evaluation-dependent details. */
export function validationResultIdentity(result) {
    const path = result.path === '#' ? '' : result.path;
    const identity = [path, result.severity, result.constraintKind, result.code,
        result.source, result.shapeId ?? result.sourceId];
    if (!path && !result.shapeId && (result.code === 'EXPLANATION_REQUIRED'
        || result.code === 'EXPLANATION_STALE' || result.code === 'EXPLANATION_UNUSED')) {
        const groupCode = result.context?.code;
        if (typeof groupCode === 'string')
            identity.push(groupCode);
    }
    return JSON.stringify(identity);
}
