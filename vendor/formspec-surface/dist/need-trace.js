/** @filedesc Canonical Need-anchor extraction shared by Surface planners and bindings. */
const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;
export function isCanonicalNeedAnchor(value) {
    return typeof value === 'string' && NEED_ANCHOR.test(value);
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
        ? anchors.filter(isCanonicalNeedAnchor)
        : [];
}
export function mergeNeedAnchors(...groups) {
    const merged = [];
    for (const group of groups) {
        for (const anchor of group ?? []) {
            if (isCanonicalNeedAnchor(anchor) && !merged.includes(anchor)) {
                merged.push(anchor);
            }
        }
    }
    return merged;
}
