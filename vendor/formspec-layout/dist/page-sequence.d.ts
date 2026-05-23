/** @filedesc Resolves assist-friendly page sequences from the authoritative layout planner. */
import type { ComponentDocument, FormDefinition, ThemeDocument } from '@formspec-org/types';
export interface PageSequenceEntry {
    id: string;
    title?: string;
    fields: string[];
}
export declare function resolvePageSequence(definition: FormDefinition, options?: {
    component?: ComponentDocument;
    theme?: ThemeDocument;
}): PageSequenceEntry[];
