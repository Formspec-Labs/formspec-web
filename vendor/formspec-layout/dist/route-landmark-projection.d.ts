/** @filedesc Shared UI Graph Policy route-landmark resolution for render consumers. */
import type { UiGraphRoutePolicyProjection } from './types.js';
export type ResolvedRouteLandmarkRole = 'main' | 'navigation' | 'complementary' | 'region';
export type ResolvedRouteLandmark = {
    role?: ResolvedRouteLandmarkRole;
    ariaLabel?: string;
};
/**
 * Map validated route policy to active landmark attributes.
 * Callers MUST gate overlay roots (Modal, Dialog, Popover) separately.
 */
export declare function resolveRouteLandmark(policy: UiGraphRoutePolicyProjection | undefined): ResolvedRouteLandmark;
