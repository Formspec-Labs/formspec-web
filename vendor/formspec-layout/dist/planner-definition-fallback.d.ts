/** @filedesc Definition-items fallback planner when no component document is provided. */
import type { FormItem, LayoutNode, PlanContext } from './types.js';
import { findItemAtPath, findItemPathByKey } from './planner-path-utils.js';
export declare function planDefinitionFallback(items: FormItem[], ctx: PlanContext, prefix?: string, applyThemePages?: boolean): LayoutNode[];
export declare function planDefinitionItem(item: FormItem, ctx: PlanContext, prefix?: string): LayoutNode;
export { findItemAtPath, findItemPathByKey };
