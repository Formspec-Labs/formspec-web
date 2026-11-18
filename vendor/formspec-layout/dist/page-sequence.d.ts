/** @filedesc Plans renderable sections and stable Item ownership in Core page-authority order. */
import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import type { LayoutNode, PlanContext } from './types.js';
export interface PageSequenceEntry {
    id?: string;
    title?: string;
    /** Item whose Locale-resolved label supplies the generated title. */
    titleBind?: string;
    titleLocaleKey?: string;
    nodes: LayoutNode[];
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
    context?: Pick<PlanContext, 'formPresentation' | 'componentGraph' | 'hostEvidence' | 'isComponentAvailable' | 'nextId' | 'activeBreakpoint'>;
}
/** Whether one placement covers every instance of the other placement. */
export declare function placementCovers(placement: string, path: string): boolean;
export declare function placementKey(path: string): string;
export declare function resolvePageSequence(definition: FormDefinition, options?: PageSequenceOptions): PageSequenceEntry[];
