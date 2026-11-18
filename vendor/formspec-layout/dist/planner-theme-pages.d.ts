/** @filedesc Theme page grid planning: regions, placement, and page node assembly. */
import type { Region } from './theme-resolver.js';
import type { FormItem, LayoutNode, PlanContext } from './types.js';
export declare function withoutThemePages(ctx: PlanContext): PlanContext;
export declare function collectAssignedTopLevelKeys(items: FormItem[], pages: NonNullable<PlanContext['theme']>['pages']): Set<string>;
export declare function buildThemePageNodes(planRegionNode: (regionPath: string) => LayoutNode | null, items: FormItem[], ctx: PlanContext, options?: {
    preserveBinding?: boolean;
    retainHiddenRegions?: boolean;
    retainRegionlessPages?: boolean;
}): LayoutNode[];
export declare function wrapRegionNode(node: LayoutNode, region: Region, activeBreakpoint: string | null, nextId: PlanContext['nextId'], retainHidden?: boolean): LayoutNode | null;
