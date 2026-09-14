import type { LayoutNode } from '@formspec-org/layout';
import type { NodeRenderer } from './node-renderer-types.js';
/** Renders a repeat group: stamps template children per instance. */
export declare function RepeatGroup({ node, renderChild }: {
    node: LayoutNode;
    renderChild: NodeRenderer;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function RepeatAccordion({ node, renderChild }: {
    node: LayoutNode;
    renderChild: NodeRenderer;
}): import("react/jsx-runtime").JSX.Element | null;
/**
 * Deep-clone a LayoutNode tree, rewriting `bindPath` onto instance `[instanceIdx]`.
 * Repeat templates plan children under `repeatPath[0]`; a bound Accordion plans them under `repeatPath.`.
 */
export declare function rewriteBindPaths(node: LayoutNode, repeatPath: string, instanceIdx: number): LayoutNode;
