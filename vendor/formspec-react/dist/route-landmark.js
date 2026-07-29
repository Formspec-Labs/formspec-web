/** @filedesc Active UI Graph Policy route-landmark attribute helper. */
import { resolveRouteLandmark } from '@formspec-org/layout';
export function routeLandmarkAttrs(node) {
    const resolved = resolveRouteLandmark(node.uiGraphRoutePolicy);
    if (!resolved.role) {
        return {};
    }
    return {
        role: resolved.role,
        ...(resolved.ariaLabel ? { 'aria-label': resolved.ariaLabel } : {}),
    };
}
