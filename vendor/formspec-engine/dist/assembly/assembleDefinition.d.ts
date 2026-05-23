/** @filedesc Resolve $ref fragments and assemble a FormDefinition via WASM. */
import type { FormDefinition } from '@formspec-org/types';
import type { AssemblyResult, DefinitionResolver } from '../interfaces.js';
export declare function assembleDefinitionSync(definition: FormDefinition, resolver: Record<string, unknown> | ((url: string, version?: string) => unknown)): AssemblyResult;
export declare function assembleDefinition(definition: FormDefinition, resolver: DefinitionResolver): Promise<AssemblyResult>;
