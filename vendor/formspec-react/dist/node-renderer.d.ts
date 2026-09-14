import type { LayoutNode } from '@formspec-org/layout';
/** Render a single LayoutNode, recursing into children. */
export declare function FormspecNode({ node: plannedNode }: {
    node: LayoutNode;
}): import("react/jsx-runtime").JSX.Element;
export { DisplayNode } from './node-renderer-display.js';
export { RepeatGroup, RepeatAccordion, rewriteBindPaths } from './node-renderer-repeat.js';
