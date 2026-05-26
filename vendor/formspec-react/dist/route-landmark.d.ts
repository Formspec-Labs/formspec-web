/** @filedesc Active UI Graph Policy route-landmark attribute helper. */
import type { AriaRole } from 'react';
import type { LayoutNode } from '@formspec-org/layout';
type RouteLandmarkRole = Extract<AriaRole, 'main' | 'navigation' | 'complementary'>;
export type RouteLandmarkAttrs = {
    role?: RouteLandmarkRole;
};
export declare function routeLandmarkAttrs(node: Pick<LayoutNode, 'uiGraphRoutePolicy'>): RouteLandmarkAttrs;
export {};
