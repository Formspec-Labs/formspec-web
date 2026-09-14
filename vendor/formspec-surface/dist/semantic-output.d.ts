/**
 * @filedesc Renderer-owned, portable semantic output observations.
 *
 * This registry contains only facts committed by a mounted renderer. It never
 * queries a DOM, infers a node from visible copy, or manufactures
 * `rendered: false` from absence.
 */
export type SurfaceSemanticValue = null | boolean | number | string | readonly SurfaceSemanticValue[] | Readonly<{
    [key: string]: SurfaceSemanticValue;
}>;
export interface SurfaceSemanticOutputArtifactIdentity {
    artifactRef: string;
    artifactDigest: string;
}
export interface QualifiedSurfaceSemanticOutputRef extends SurfaceSemanticOutputArtifactIdentity {
    subjectKind: 'surface-node';
    subjectRef: string;
}
export interface SurfaceSemanticOutputTarget {
    renderInstanceId: string;
    node: QualifiedSurfaceSemanticOutputRef;
}
/** One node the current renderer commit actually produced. */
export interface SurfaceSemanticOutputDeclaration {
    subjectRef: string;
    operable?: boolean | undefined;
    semanticValue?: SurfaceSemanticValue | undefined;
}
/** A detached, immutable observation from one live renderer publisher. */
export interface SurfaceSemanticOutputObservation extends SurfaceSemanticOutputTarget {
    rendered: true;
    operable?: boolean | undefined;
    semanticValue?: SurfaceSemanticValue | undefined;
}
export interface SurfaceSemanticOutputScopeIdentity {
    surfaceArtifact: SurfaceSemanticOutputArtifactIdentity;
    renderInstanceId: string;
}
/** Caller-paired identity supplied to a renderer; the renderer computes none of it. */
export interface SurfaceSemanticOutputScope extends SurfaceSemanticOutputScopeIdentity {
    registry: SurfaceSemanticOutputRegistry;
}
/** Exact subject subtree assigned by the Surface slot owner to one publisher. */
export interface SurfaceSemanticOutputMountScopeIdentity extends SurfaceSemanticOutputScopeIdentity {
    subjectPrefix: string;
}
/**
 * The only scope a renderer publisher receives. It cannot publish outside the
 * exact route/slot subtree assigned by the Surface shell.
 */
export interface SurfaceSemanticOutputPublisherScope extends SurfaceSemanticOutputMountScopeIdentity {
    registry: SurfaceSemanticOutputRegistry;
}
export interface ResolvedSurfaceSemanticOutput {
    status: 'resolved';
    output: SurfaceSemanticOutputObservation;
}
export interface MissingSurfaceSemanticOutput {
    status: 'missing';
    target: SurfaceSemanticOutputTarget;
}
export interface AmbiguousSurfaceSemanticOutput {
    status: 'ambiguous';
    target: SurfaceSemanticOutputTarget;
    publisherCount: number;
}
export type SurfaceSemanticOutputLookup = ResolvedSurfaceSemanticOutput | MissingSurfaceSemanticOutput | AmbiguousSurfaceSemanticOutput;
export type SurfaceSemanticOutputSnapshotEntry = ResolvedSurfaceSemanticOutput | AmbiguousSurfaceSemanticOutput;
export interface SurfaceSemanticOutputMount {
    /**
     * Atomically replaces this publisher's prior commit when every declaration
     * is valid. A malformed replacement clears the prior commit, publishes
     * nothing, and throws, so stale values cannot survive a failed update.
     */
    replace(outputs: readonly SurfaceSemanticOutputDeclaration[]): void;
    /** Idempotently removes every output owned by this publisher. */
    dispose(): void;
}
export interface SurfaceSemanticOutputRegistry {
    /** Opens one independently cleaned-up renderer publisher. */
    mount(scope: SurfaceSemanticOutputMountScopeIdentity): SurfaceSemanticOutputMount;
    /** Resolves only an exact artifact, digest, render instance, and subject. */
    lookup(target: SurfaceSemanticOutputTarget): SurfaceSemanticOutputLookup;
    /**
     * Returns every live exact target in one exact scope. Duplicate publishers
     * remain explicit `ambiguous` entries; the registry never picks a winner.
     */
    snapshot(scope: SurfaceSemanticOutputScopeIdentity): readonly SurfaceSemanticOutputSnapshotEntry[];
}
/**
 * Creates one output aggregation domain for a host or outcome runner.
 *
 * The registry deliberately has no history-based `rendered: false` state.
 * Once the last publisher disposes an output, an exact lookup is `missing`.
 */
export declare function createSurfaceSemanticOutputRegistry(): SurfaceSemanticOutputRegistry;
