/** @filedesc Data Sources catalog, availability, and Surface widget binding checks. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
/**
 * Validate Data Sources graph membership and Surface widget data references.
 *
 * This pass only examines authored descriptors. It never fetches, caches, or
 * materializes a source payload.
 */
export declare function validateDataSources(context: AppGraphContext): AppGraphDiagnostic[];
