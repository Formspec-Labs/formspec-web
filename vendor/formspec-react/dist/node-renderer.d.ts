import React from 'react';
import type { LayoutNode } from '@formspec-org/layout';
/** Render a single LayoutNode, recursing into children. */
export declare function FormspecNode({ node: plannedNode }: {
    node: LayoutNode;
}): import("react/jsx-runtime").JSX.Element;
/** Group runs of 2+ adjacent ActionButton siblings into a horizontal action bar while leaving single actions untouched. */
export declare function renderActionGroupedChildren(children: readonly LayoutNode[], options?: {
    beforeTrailingActions?: React.ReactNode;
}): React.ReactNode[];
/** True when a root layout tree renders root WarningExplanations above its own Submit controls. */
export declare function layoutOwnsRootWarningExplanations(layoutPlan: LayoutNode | null, workspacePages: unknown): boolean;
export { DisplayNode } from './node-renderer-display.js';
export { RepeatGroup, RepeatAccordion, rewriteBindPaths } from './node-renderer-repeat.js';
