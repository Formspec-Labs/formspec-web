/** @filedesc Definition constructor helpers: option-set inlining and static FEL cycle detection. */
import type { FormVariable } from '@formspec-org/types';
import type { FormDefinition } from '@formspec-org/types';
import type { EngineBindConfig } from './helpers.js';
export declare function resolveOptionSetsOnDefinition(definition: FormDefinition): FormDefinition;
export declare function validateVariableDefinitionCycles(variableDefs: FormVariable[]): void;
export declare function validateCalculateBindCycles(bindConfigs: Record<string, EngineBindConfig>): void;
