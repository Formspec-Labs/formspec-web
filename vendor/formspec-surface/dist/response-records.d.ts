/** @filedesc Prepare immutable filings and read them through the shared Rust selector. */
import type { DispositionObservation, FormDefinition, FormResponse, NewerSelectedResponse, ResponseSelectionRecord, SelectResponses, SurfaceScenarioProfile } from '@formspec-org/types';
import type { DraftKey, FilingObservation } from './draft-port.js';
export interface ResponseRecordTools {
    parseResponse(text: string): FormResponse;
    subjectId: (type: string, keys: NonNullable<NonNullable<FormResponse['subject']>['keys']>) => string;
    selectResponses: SelectResponses;
}
export interface ResponseFiling extends NewerSelectedResponse {
    key: DraftKey;
    definitionVersion: string;
    responseJson: string;
    sample: 'preview-submit' | 'fixture';
}
export type ResponseFixtures = Pick<SurfaceScenarioProfile, 'filings' | 'decisions'>;
export declare const responsePairKey: ({ responseId, responseHash }: {
    responseId: string;
    responseHash?: string | undefined;
}) => string;
export declare function responseDraftKey(scope: string, response: FormResponse, definition: FormDefinition, tools: ResponseRecordTools): DraftKey;
export declare function responseSelectionRecord(key: DraftKey, responseJson: string): ResponseSelectionRecord;
export declare function prepareResponseFiling(scope: string, definitions: ReadonlyMap<string, FormDefinition>, responseJson: string, sample: ResponseFiling['sample'], tools: ResponseRecordTools): ResponseFiling;
export declare function prepareResponseFixtures(scope: string, definitions: ReadonlyMap<string, FormDefinition>, fixtures: ResponseFixtures, tools: ResponseRecordTools): {
    filings: ResponseFiling[];
    decisions: Map<string, DispositionObservation>;
};
export declare function selectFilingStatus(key: DraftKey, definition: FormDefinition, candidates: readonly ResponseFiling[], decisions: ReadonlyMap<string, DispositionObservation>, tools: ResponseRecordTools): FilingObservation;
