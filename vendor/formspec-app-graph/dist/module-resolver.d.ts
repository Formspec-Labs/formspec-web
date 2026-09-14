/** @filedesc Shared ModuleResolver kernel for module admission and contribution evidence. */
import type { ModuleResolutionRef, ModuleResolutionReport, ModuleResolutionSourcePointer, ModuleResolutionSupportProfile } from '@formspec-org/types';
import type { AppGraphHostEvidence, ResolvedArtifactHandle } from './types.js';
export interface ModuleResolverRegistryEntry {
    name: string;
    category: string;
    version?: string;
    contributes?: string[];
    dependencies?: ModuleResolutionRef[];
    widgetShape?: {
        props?: unknown;
        tokenSlots?: unknown;
        dataInputs?: unknown;
        actionOutputs?: unknown;
    };
    categoryShape?: {
        prefix?: unknown;
        tokens?: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface ModuleResolverRegistryInput {
    entries: ModuleResolverRegistryEntry[];
    artifactSlot?: string;
    artifactKind?: 'registry';
    source?: string;
}
export interface ModuleResolverModuleInput extends ModuleResolutionRef {
    source?: ModuleResolutionSourcePointer;
    defaulted?: boolean;
}
export interface ModuleResolverContributionUse {
    site: string;
    name: string;
    expectedCategory: string;
    expectedOwnerModuleId?: string;
    payload?: unknown;
    source: ModuleResolutionSourcePointer;
    payloadSource?: ModuleResolutionSourcePointer;
    payloadValidator?: string;
}
export interface ModuleResolverDocumentInput {
    artifactSlot: string;
    artifactKind: string;
    modules?: ModuleResolverModuleInput[];
    uses?: ModuleResolverContributionUse[];
    source?: string;
}
export interface ModuleResolverAdmissionInput {
    allowedModules?: ModuleResolutionRef[];
}
export interface ModulePayloadValidatorInput {
    payload: unknown;
    schema: unknown;
}
export interface ModulePayloadValidatorResult {
    ok: boolean;
    path?: string;
    reason?: string;
    keyword?: string;
    message?: string;
    schemaPath?: string;
    schemaFragmentPath?: string;
}
export type ModulePayloadValidator = (input: ModulePayloadValidatorInput) => ModulePayloadValidatorResult;
export interface ModuleResolverSupportInput extends ModuleResolutionSupportProfile {
    defaultModules?: ModuleResolverModuleInput[];
    payloadValidators?: Record<string, ModulePayloadValidator | undefined>;
}
export interface ModuleResolverInput {
    appModules: ModuleResolverModuleInput[];
    documents?: ModuleResolverDocumentInput[];
    registries: ModuleResolverRegistryInput[];
    admission?: ModuleResolverAdmissionInput;
    support?: ModuleResolverSupportInput;
    source?: string;
}
export interface ModuleResolverGraphInput {
    manifest: ResolvedArtifactHandle;
    handles: readonly ResolvedArtifactHandle[];
    hostEvidence?: AppGraphHostEvidence;
    admission?: ModuleResolverAdmissionInput;
    support?: ModuleResolverSupportInput;
    source?: string;
}
export declare function moduleResolverInputFromAppGraph(input: ModuleResolverGraphInput): ModuleResolverInput;
export declare function resolveModules(input: ModuleResolverInput): ModuleResolutionReport;
