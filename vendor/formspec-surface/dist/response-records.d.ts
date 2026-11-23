/** @filedesc Prepare immutable filings, seeded drafts, and review decisions for Surface hosts. */
import type { DispositionObservation, FormDefinition, FormResponse, NewerSelectedResponse, ResponseSelectionRecord, SelectResponses, SurfaceScenarioDraft, SurfaceScenarioProfile } from '@formspec-org/types';
import type { DraftKey, FilingObservation } from './draft-port.js';
import { type FiniteJsonValue } from './finite-json.js';
export interface ResponseRecordTools {
    parseResponse(text: string): FormResponse;
    subjectId: (type: string, keys: NonNullable<NonNullable<FormResponse['subject']>['keys']>) => string;
    selectResponses: SelectResponses;
    isValidAuthored?: (authored: string) => boolean;
}
export interface ResponseFiling extends NewerSelectedResponse {
    key: DraftKey;
    definitionVersion: string;
    authored: string;
    responseJson: string;
    sample: 'preview-submit' | 'fixture';
}
export interface ResponseFilingSummary extends NewerSelectedResponse {
    key: DraftKey;
    definitionVersion: string;
    authored: string;
    sample: 'preview-submit' | 'fixture';
}
export interface PreparedDraftFixture {
    key: DraftKey;
    definitionVersion: string;
    responseId: string;
    authored: string;
    data: Record<string, FiniteJsonValue>;
}
export interface PreparedResponseFixtures {
    readonly filings: readonly ResponseFiling[];
    readonly filingSummaries: readonly ResponseFilingSummary[];
    readonly decisions: ReadonlyMap<string, DispositionObservation>;
    readonly drafts: readonly PreparedDraftFixture[];
}
export declare function toResponseFilingSummary(filing: ResponseFiling): ResponseFilingSummary;
export interface DraftFixtureIssue {
    /** Subpath relative to the profile (for example, "drafts[0].subject.keys"). */
    subpath: string;
    message: string;
}
export type ResponseFixtures = Pick<SurfaceScenarioProfile, 'filings' | 'decisions' | 'drafts'>;
/**
 * Validate an RFC 3339 Response ordering instant with exact calendar and leap-second rules,
 * delegating to the native Rust `isValidResponseAuthored` oracle whenever `tools` is supplied.
 */
export declare function validResponseAuthored(authored: string, tools?: ResponseRecordTools): boolean;
export declare function defaultDraftResponseId(scope: string, definitionUrl: string, subject?: {
    type: string;
    keys: Readonly<Record<string, string | number>>;
}): string;
export declare function validateDraftFixtures(definitions: ReadonlyMap<string, FormDefinition>, drafts: readonly SurfaceScenarioDraft[] | undefined, options?: {
    scope?: string | undefined;
    tools?: ResponseRecordTools | undefined;
    existingResponseIds?: ReadonlySet<string> | undefined;
}): DraftFixtureIssue[];
export declare function prepareDraftFixtures(scope: string, definitions: ReadonlyMap<string, FormDefinition>, drafts: readonly SurfaceScenarioDraft[] | undefined, tools: ResponseRecordTools, existingResponseIds?: ReadonlySet<string>): PreparedDraftFixture[];
export declare const responsePairKey: ({ responseId, responseHash }: {
    responseId: string;
    responseHash?: string | undefined;
}) => string;
export declare function responseDraftKey(scope: string, response: FormResponse, definition: FormDefinition, tools: ResponseRecordTools): DraftKey;
export declare function responseSelectionRecord(key: DraftKey, responseJson: string, kind: ResponseSelectionRecord['kind']): ResponseSelectionRecord;
export declare function prepareResponseFiling(scope: string, definitions: ReadonlyMap<string, FormDefinition>, responseJson: string, sample: ResponseFiling['sample'], tools: ResponseRecordTools): ResponseFiling;
export declare function prepareResponseFixtures(scope: string, definitions: ReadonlyMap<string, FormDefinition>, fixtures: ResponseFixtures, tools: ResponseRecordTools): PreparedResponseFixtures;
export declare function selectFilingSummaryStatus(key: DraftKey, definition: FormDefinition, candidates: readonly ResponseFilingSummary[], decisions: ReadonlyMap<string, DispositionObservation>, tools: ResponseRecordTools): FilingObservation;
export declare function selectFilingStatus(key: DraftKey, definition: FormDefinition, candidates: readonly ResponseFiling[], decisions: ReadonlyMap<string, DispositionObservation>, tools: ResponseRecordTools): FilingObservation;
