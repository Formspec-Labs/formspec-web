/** @filedesc Component-document tree planner: slots, repeats, custom components, theme pages. */
import type { ComponentTreeNode, LayoutNode, PlanContext } from './types.js';
import { findNodeByBindPath } from './planner-path-utils.js';
export declare function planComponentTree(tree: ComponentTreeNode, ctx: PlanContext, prefix?: string, customComponentStack?: Set<string>, applyThemePages?: boolean): LayoutNode;
export { findNodeByBindPath };
