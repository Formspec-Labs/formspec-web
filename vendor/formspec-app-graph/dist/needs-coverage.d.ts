/** @filedesc Needs Document integrity, needRef resolution, and coverage diagnostics over a caller-paired bundle. */
import { type AppGraphContext, type AppGraphDiagnostic } from './types.js';
export type NeedStatus = 'proposed' | 'adopted' | 'superseded' | 'withdrawn';
/** One EARL-shaped report row, carried on every NEED-* diagnostic's `details`. */
export interface NeedsEarlFrame {
    /** Who ran the check. */
    assertor: string;
    /** What was tested — a Need id, a Unit id, or the document itself. */
    subject: string;
    /** The rule the subject was tested against, as a spec-section handle. */
    criterion: string;
    /** EARL outcome vocabulary, narrowed to what this checker can conclude. */
    outcome: 'failed' | 'cantTell';
}
/**
 * Needs Core processor steps 2–3 plus Needs Coverage checker steps 4–5
 * (needs-spec S10.1), over the caller-paired (Needs Document, bundle) pair.
 *
 * **Unpaired is inapplicable, not failing** (S2.1). With no
 * `hostEvidence.needsDocuments[]`, this returns an empty array: no resolution
 * finding, no coverage finding, and specifically no `NEED-COVERAGE-002` on
 * units that cite nothing — there is nothing for them to have cited. An entry
 * whose document does not declare `$formspecNeeds: '1.0'` is not a pairing
 * either; see {@link needsDocuments}.
 *
 * Every finding is `phase: 'cross-artifact'`, severity per S9.4, and carries
 * the EARL frame (assertor / subject / criterion / outcome) on `details` so a
 * coverage report reads like a conformance audit (S9.3).
 */
export declare function validateNeedsCoverage(context: AppGraphContext): AppGraphDiagnostic[];
