/** @filedesc Build Definition reads and deliver authorized selector results to FormEngine. */
import type { DraftKey, DraftRecord } from '@formspec-org/surface';
import type { DefinitionResponseSelectionRequest, FormDefinition, ResponseSelectionOutcome, ResponseSelector } from '@formspec-org/types';
export interface DraftDefinitionResponseRead {
    key: DraftKey;
    definitionVersion: string;
    /** Null selects opening reads for a subject that still has no draft. */
    expectedRevision: string | null;
}
export type DraftDefinitionResponseResult = {
    status: 'resolved';
    outcomes: ReadonlyMap<string, ResponseSelectionOutcome>;
    missingPrerequisite?: string;
} | {
    status: 'unconfigured' | 'unavailable' | 'conflict';
};
export interface DraftDefinitionResponsePort {
    selectDefinitionResponses(input: Readonly<DraftDefinitionResponseRead>, signal?: AbortSignal): Promise<DraftDefinitionResponseResult>;
}
export declare function requireDraftResponsePins(port: Partial<DraftDefinitionResponsePort> | undefined, input: Readonly<DraftDefinitionResponseRead>): Promise<DraftRecord['pins'] | undefined>;
export declare function definitionResponseRequests(definition: FormDefinition, key: DraftKey, pins?: DraftRecord['pins'], required?: ReadonlySet<string>): DefinitionResponseSelectionRequest[];
export declare function resolveDefinitionReads(selector: ResponseSelector | undefined, requests: DefinitionResponseSelectionRequest[], signal: AbortSignal): Promise<DraftRecord['pins']>;
export declare function responseDeliveries(results: ReadonlyMap<string, ResponseSelectionOutcome> | undefined, keys?: Iterable<string>): DraftRecord['pins'];
