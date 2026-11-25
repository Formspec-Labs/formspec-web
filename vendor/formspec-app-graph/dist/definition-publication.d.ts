/** @filedesc Build the trace record for each published Definition from the admitted bundle. */
import type { AppGraphReportProducerResult } from './producer.js';
import type { AppGraphValidationReport } from './types.js';
/**
 * Retains the admission evidence from the whole bundle, with each form's trace inventory
 * and its redundant-anchor warnings. A refused graph produces no publication records.
 */
export declare function definitionPublicationReports({ report, artifactResolutionReport }: AppGraphReportProducerResult): AppGraphValidationReport[];
