/** @filedesc Experience-internal actor and task reference validation. */
import { type AppGraphContext, type AppGraphDiagnostic } from './types.js';
/**
 * Enforces Experience referential integrity after schema validation.
 *
 * AppGraph treats these findings as blocking errors so authoring and export
 * cannot claim a clean graph while Experience references are unresolved.
 */
export declare function validateExperienceReferentialIntegrity(context: AppGraphContext): AppGraphDiagnostic[];
