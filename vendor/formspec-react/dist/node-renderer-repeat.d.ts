import type { LayoutNode } from '@formspec-org/layout';
import type { NodeRenderer } from './node-renderer-types.js';
/** Renders a repeat group: stamps template children per instance. */
export declare function RepeatGroup({ node, renderChild }: {
    node: LayoutNode;
    renderChild: NodeRenderer;
}): import("react/jsx-runtime").JSX.Element;
export declare function RepeatAccordion({ node, renderChild }: {
    node: LayoutNode;
    renderChild: NodeRenderer;
}): import("react/jsx-runtime").JSX.Element;
/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` from template `[0]` to `[instanceIdx]`.
 */
export declare function rewriteBindPaths(node: LayoutNode, repeatPath: string, instanceIdx: number): LayoutNode;
