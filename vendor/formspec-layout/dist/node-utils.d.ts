/** @filedesc Layout node IDs, classification, token/CSS helpers, and plan context prep. */
import type { LayoutNode, NodeIdGenerator, PlanContext } from './types.js';
/** Copy only canonical Need anchors from authored generation metadata. */
export declare function needGenerationAnchors(...values: readonly unknown[]): string[];
export declare function classifyComponent(type: string): LayoutNode['category'];
export declare function createNodeIdGenerator(start?: number): NodeIdGenerator;
/** Attach a per-plan ID generator when callers omit `nextId`. */
export declare function preparePlanContext(ctx: Omit<PlanContext, 'nextId'> & Partial<Pick<PlanContext, 'nextId'>>): PlanContext;
export declare function planContains(node: LayoutNode, component: string): boolean;
export interface EnsureActionButtonOptions {
    pageMode?: string;
    actionRef?: string;
}
export declare function ensureActionButton(root: LayoutNode, nextId?: NodeIdGenerator, options?: EnsureActionButtonOptions): void;
/**
 * Put a `ValidationSummary` at the head of the plan unless the document already places one: the latest
 * submit's findings, field errors included, each a jump link to its field (component spec: ValidationSummary).
 * A form with no Component document has no way to ask for one, so a host that wants the summary a long form
 * needs opts in, the way it opts into the submit button.
 */
export declare function ensureValidationSummary(root: LayoutNode, nextId?: NodeIdGenerator): void;
export declare function resolveTokenInContext(val: unknown, ctx: PlanContext): unknown;
export declare function resolveStyleTokens(style: Record<string, string | number> | undefined, ctx: PlanContext): Record<string, string | number> | undefined;
export declare function resolveGridTracks(val: unknown, ctx: PlanContext): unknown;
export declare function gridPlacementStyleFromLayout(layout: unknown): Record<string, string> | undefined;
export declare function normalizeCssClass(val: string | string[] | undefined): string[];
export declare function resolveCssClasses(comp: {
    cssClass?: string | string[];
}, ctx: PlanContext): string[];
export declare function extractProps(comp: Record<string, unknown>): Record<string, unknown>;
