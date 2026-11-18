/** @filedesc Materialize React's page modes from the same section sequence as Assist. */
import type { FormDefinition } from '@formspec-org/types';
import { type LayoutNode, type PageSequenceEntry, type PlanContext } from '@formspec-org/layout';
export interface WorkspacePage extends PageSequenceEntry {
    content: LayoutNode;
}
export declare function planPageMode(definition: FormDefinition, ctx: PlanContext, mode: 'wizard' | 'tabs' | 'workspace'): {
    root: LayoutNode;
    workspace: {
        content: LayoutNode;
        id?: string;
        title?: string;
        titleBind?: string;
        titleLocaleKey?: string;
        titleHeadingId?: string;
        nodes: LayoutNode[];
        sharedNodes?: LayoutNode[];
        container?: LayoutNode;
        fields: string[];
        fieldTemplates: string[];
        groups: string[];
    }[];
} | {
    root: LayoutNode;
    workspace: undefined;
} | undefined;
