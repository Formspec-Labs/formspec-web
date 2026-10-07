/** @filedesc Exact route/session identity shared by the Surface shell and qualified hosts. */
import { type SurfaceApp as ComposedSurfaceApp } from "@formspec-org/surface";
export interface SurfaceRuntimeGenerationInput {
    /** Same admitted composition and options exposed by useSurfaceApp. */
    app: ComposedSurfaceApp;
    /** Opaque host marker, not the derived Data Source request identity. */
    sessionGeneration?: string | number | undefined;
    location: string;
    /** Same explicit SurfaceApp props; do not merge parameters parsed from the path. */
    routeParams?: Readonly<Record<string, string>> | undefined;
}
/**
 * Derive the exact identity carried by Data Source requests and action guards.
 * Hosts register it before loading; equality supplies no authority or freshness.
 * Use a host visit/invalidation marker to distinguish a return to the same route.
 */
export declare function deriveSurfaceRuntimeGeneration(input: SurfaceRuntimeGenerationInput): string;
