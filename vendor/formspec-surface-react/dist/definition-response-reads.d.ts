/** @filedesc Build Definition reads and deliver authorized selector results to FormEngine. */
import type { DraftKey, DraftRecord } from '@formspec-org/surface';
import type { DefinitionResponseSelectionRequest, FormDefinition, ResponseSelector } from '@formspec-org/types';
export declare function definitionResponseRequests(definition: FormDefinition, key: DraftKey, pins?: DraftRecord['pins']): DefinitionResponseSelectionRequest[];
export declare function resolveDefinitionReads(selector: ResponseSelector | undefined, requests: DefinitionResponseSelectionRequest[], signal: AbortSignal): Promise<DraftRecord['pins']>;
