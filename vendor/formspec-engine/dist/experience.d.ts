/** @filedesc Experience processor predicates for sidecar coverage and references. */
type JsonObject = Record<string, unknown>;
export type ExperienceFindingCode = 'EXP-TARGET-DEFINITION-MISMATCH' | 'EXP-TARGET-DEFINITION-VERSION-MISMATCH' | 'EXP-REFERENTIAL-INTEGRITY' | 'EXP-ITEM-REF-UNRESOLVED' | 'EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM';
export interface ExperienceFinding {
    code: ExperienceFindingCode;
    severity: 'warning';
    path: string;
    message: string;
    ref?: string;
    target?: 'actors' | 'tasks';
    unitId?: string;
    experienceId?: string;
}
export interface ExperienceAnalysis {
    findings: ExperienceFinding[];
    targetDefinition: ExperienceFinding[];
    referentialIntegrity: ExperienceFinding[];
    unresolvedItemRefs: ExperienceFinding[];
    coverage: ExperienceFinding[];
}
export declare function analyzeExperience(definition: JsonObject, experience: JsonObject): ExperienceAnalysis;
export declare function targetDefinitionFindings(definition: JsonObject, experience: JsonObject): ExperienceFinding[];
export declare function coverageFindings(definition: JsonObject, experience: JsonObject): ExperienceFinding[];
export declare function unresolvedItemRefFindings(definition: JsonObject, experience: JsonObject): ExperienceFinding[];
export declare function referentialIntegrityFindings(experience: JsonObject): ExperienceFinding[];
export {};
