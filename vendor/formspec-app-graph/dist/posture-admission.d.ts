/** @filedesc ADR 0150 §4.4/§5.4 posture admission matchers shared by app-graph and lint parity. */
export interface PostureModuleRef {
    id: string;
    version: string;
    publisher?: string;
    lockHash?: string;
}
export type PostureModuleField = 'version' | 'publisher' | 'lockHash';
export type ModulePostureAdmissionResult = {
    admitted: true;
} | {
    admitted: false;
    reason: 'not-listed';
} | {
    admitted: false;
    reason: 'field-mismatch';
    field: PostureModuleField;
};
/**
 * Evaluate whether a document `modules[]` entry is admitted by posture `allowedModules[]`.
 * When `allowedModules` is absent or empty, admission is permissive (no posture constraint).
 */
export declare function evaluateModulePostureAdmission(documentRef: PostureModuleRef, allowedModules: readonly PostureModuleRef[] | undefined): ModulePostureAdmissionResult;
/** Binary actor URN admission per ADR 0150 §5.4. Empty/absent allowlist is permissive. */
export declare function evaluateActorPostureAdmission(actorUrn: string, allowedActors: readonly string[] | undefined): boolean;
