/** @filedesc Active UI Graph Policy route-landmark attribute helper. */
import { type ResolvedRouteLandmarkRole } from '@formspec-org/layout';
import type { AriaRole } from 'react';
import type { LayoutNode } from '@formspec-org/layout';
export type RouteLandmarkAttrs = {
    role?: Extract<AriaRole, ResolvedRouteLandmarkRole>;
    'aria-label'?: string;
};
export declare function routeLandmarkAttrs(node: Pick<LayoutNode, 'uiGraphRoutePolicy'>): RouteLandmarkAttrs;
