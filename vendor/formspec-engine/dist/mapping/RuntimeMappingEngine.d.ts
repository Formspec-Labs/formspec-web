/** @filedesc Runtime mapping document execution with WASM core and TS adapter formatting. */
import type { MappingDocument } from '@formspec-org/types';
import type { IRuntimeMappingEngine, JsonValue, RuntimeMappingResult } from '../interfaces.js';
export declare class RuntimeMappingEngine implements IRuntimeMappingEngine {
    private readonly doc;
    constructor(mappingDocument: MappingDocument);
    forward(source: JsonValue | string): RuntimeMappingResult;
    reverse(source: JsonValue | string): RuntimeMappingResult;
    private execute;
}
export declare function createMappingEngine(mappingDoc: MappingDocument): IRuntimeMappingEngine;
