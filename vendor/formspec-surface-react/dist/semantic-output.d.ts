/** @filedesc React commit lifecycle for portable Surface semantic outputs. */
import type { SurfaceRoutePlan, SurfaceSemanticOutputArtifactIdentity, SurfaceSemanticOutputDeclaration, SurfaceSemanticOutputPublisherScope, SurfaceSemanticOutputRegistry, SurfaceSemanticOutputScope } from '@formspec-org/surface';
import type { SurfaceWidget, SurfaceWidgetRouteContext } from './widget-api.js';
export interface SurfaceSemanticOutputScopeRequest {
    plan: SurfaceRoutePlan<SurfaceWidget>;
    route: SurfaceWidgetRouteContext;
    runtimeGeneration: string | undefined;
}
export type SurfaceSemanticOutputScopeResolver = (request: SurfaceSemanticOutputScopeRequest) => SurfaceSemanticOutputScope | undefined;
export interface SurfaceSemanticOutputPairing {
    registry: SurfaceSemanticOutputRegistry;
    /**
     * Returns caller-computed canonical identity for the exact loaded Surface.
     * The helper refuses an identity whose reference differs from `surfaceRef`.
     */
    surfaceArtifactFor(request: SurfaceSemanticOutputScopeRequest): SurfaceSemanticOutputArtifactIdentity | undefined;
    renderInstanceIdFor(request: SurfaceSemanticOutputScopeRequest): string | undefined;
}
/**
 * Builds a fail-closed route resolver. Canonicalization, digest computation,
 * and render-instance allocation remain outside the renderer.
 */
export declare function createSurfaceSemanticOutputScopeResolver(pairing: SurfaceSemanticOutputPairing): SurfaceSemanticOutputScopeResolver;
/**
 * Publishes exactly the declarations produced by the current React commit.
 *
 * Data updates replace the existing mount in place. Scope changes and unmounts
 * dispose the prior publisher, including under React Strict Mode remounting.
 */
export declare function useSurfaceSemanticOutputs(scope: SurfaceSemanticOutputPublisherScope | undefined, outputs: readonly SurfaceSemanticOutputDeclaration[]): void;
/** Existing stable Surface review identity: route, slot, then authored IDs. */
export declare function surfaceSemanticOutputSubjectRef(...segments: readonly string[]): string | undefined;
