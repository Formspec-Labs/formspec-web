/** @filedesc Wizard/tabs page-mode materialization for definition and component plans. */
import type { ComponentDocument } from '@formspec-org/types';
import type { FormItem, LayoutNode, NodeIdGenerator, PlanContext } from './types.js';
export type PlannedPage = {
    id?: string;
    title: string;
    /** Path of the group item whose live label titles the page, so a Locale's `<key>.label` renames the step. */
    titleBind?: string;
    /** The `$ui` chrome key the title comes from, for a page nobody authored. */
    titleKey?: string;
    children: LayoutNode[];
};
export declare function emitPageModePages(orphans: LayoutNode[], pages: PlannedPage[], nextId?: NodeIdGenerator): LayoutNode[];
export declare function buildDefinitionPages(nodes: LayoutNode[], items: FormItem[]): {
    orphans: LayoutNode[];
    pages: PlannedPage[];
};
export declare function applyDefinitionPageMode(nodes: LayoutNode[], ctx: PlanContext): LayoutNode[];
export declare function applyGeneratedPageMode(rootNode: LayoutNode, componentType: string, ctx: PlanContext): LayoutNode;
export declare function isStudioGeneratedComponentDoc(doc: ComponentDocument | undefined): boolean;
export declare function stripTitleFromGroupNode(node: LayoutNode): LayoutNode;
