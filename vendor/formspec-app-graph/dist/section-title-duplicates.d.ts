import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
export declare const SECTION_TITLE_DUPLICATE_CODE = "APP-GRAPH-SECTION-TITLE-DUPLICATE";
export declare function normalizeUxTitle(value: string): string;
export declare function validateSectionTitleDuplicates(context: AppGraphContext): {
    diagnostics: AppGraphDiagnostic[];
    plannedComponents: Map<ResolvedArtifactHandle<unknown>, Set<string | undefined>>;
};
