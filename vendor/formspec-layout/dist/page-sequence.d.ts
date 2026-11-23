/** @filedesc Plans renderable sections and stable Item ownership in Core page-authority order. */
import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import type { LayoutNode, PlanContext } from './types.js';
export interface PageSequenceEntry {
    id?: string;
    title?: string;
    /** Item whose Locale-resolved label supplies the generated title. */
    titleBind?: string;
    titleLocaleKey?: string;
    /** Layout node ID of the Heading promoted to the page title. */
    titleHeadingId?: string;
    nodes: LayoutNode[];
    /** Trailing instructions and controls shown on every page. */
    sharedNodes?: LayoutNode[];
    /** The Component root to wrap the selected nodes in when the authored root is split. */
    container?: LayoutNode;
    /** Unique field placement paths. A repeat template uses [*], an explicit index stays concrete. */
    fields: string[];
    /** Authored field templates assigned once across the plan, for fixed-width progress segments. */
    fieldTemplates: string[];
    groups: string[];
}
export interface PageSequenceOptions {
    component?: ComponentDocument;
    theme?: PlanContext['theme'];
    context?: Partial<Pick<PlanContext, 'formPresentation' | 'componentGraph' | 'hostEvidence' | 'isComponentAvailable' | 'nextId' | 'activeBreakpoint'>>;
}
/** Whether one placement covers every instance of the other placement. */
export declare function placementCovers(placement: string, path: string): boolean;
export declare function placementKey(path: string): string;
export declare function resolvePageSequence(definition: FormDefinition, options?: PageSequenceOptions): PageSequenceEntry[];
/** Title source for an explicit Wizard child, shared by the renderer and authoring checks. */
export declare function describeWizardStep(node: LayoutNode, index: number): {
    id: string | undefined;
    authoredSection: boolean;
    title: string | undefined;
    titleBind: string | undefined;
    titleLocaleKey: string | undefined;
    titleIndex: number;
};
export declare function findAuthoredPageSection(page: PageSequenceEntry): LayoutNode | undefined;
export declare function hasWizardSections(pages: readonly PageSequenceEntry[]): boolean;
/** Apply the normal Component planner when the document supplies its own page control. */
export declare function planExplicitPageRoot(definition: FormDefinition, options: PageSequenceOptions): LayoutNode | undefined;
/** Section titles from the same planner inputs the respondent view uses. */
export declare function resolveSectionTitlePlan(definition: FormDefinition, options?: PageSequenceOptions): {
    id: string | undefined;
    authoredSection: boolean;
    title: string | undefined;
    titleBind: string | undefined;
    titleLocaleKey: string | undefined;
    titleIndex: number;
}[] | {
    titleIndex: number;
    id?: string;
    title?: string;
    /** Item whose Locale-resolved label supplies the generated title. */
    titleBind?: string;
    titleLocaleKey?: string;
    /** Layout node ID of the Heading promoted to the page title. */
    titleHeadingId?: string;
    nodes: LayoutNode[];
    /** Trailing instructions and controls shown on every page. */
    sharedNodes?: LayoutNode[];
    /** The Component root to wrap the selected nodes in when the authored root is split. */
    container?: LayoutNode;
    /** Unique field placement paths. A repeat template uses [*], an explicit index stays concrete. */
    fields: string[];
    /** Authored field templates assigned once across the plan, for fixed-width progress segments. */
    fieldTemplates: string[];
    groups: string[];
}[];
