/**
 * @filedesc Generic, preview-only runtime state for a resolved Surface bundle.
 *
 * A scenario is data, not application code. It names one initial URL, one or
 * more runtime profiles, exact `(catalogRef, sourceRef)` outcomes, and action
 * outcomes. This module validates those names against a resolved bundle and
 * adapts a selected profile to the existing Surface runtime ports.
 */
import type { SurfaceScenarioActionOutcome, SurfacePreviewScenario } from '@formspec-org/types';
import type { ResolvedBundle } from './bundle.js';
import type { DataSourceAuthorizer, DataSourceDescriptor, DataSourceLoader, DataSourcePayloadValidationResult } from './data-source-loader.js';
import type { TransitionExecutor } from './transitions.js';
export declare const SURFACE_SCENARIO_DIAGNOSTIC_CODES: readonly ["SURFACE-SCENARIO-SCHEMA", "SURFACE-SCENARIO-PROFILE-UNRESOLVED", "SURFACE-SCENARIO-INITIAL-ROUTE-UNRESOLVED", "SURFACE-SCENARIO-SOURCE-UNRESOLVED", "SURFACE-SCENARIO-SOURCE-AMBIGUOUS", "SURFACE-SCENARIO-ACTION-UNRESOLVED", "SURFACE-SCENARIO-ACTION-AMBIGUOUS", "SURFACE-SCENARIO-PAYLOAD-SCHEMA"];
export type SurfaceScenarioDiagnosticCode = (typeof SURFACE_SCENARIO_DIAGNOSTIC_CODES)[number];
export interface SurfaceScenarioDiagnostic {
    code: SurfaceScenarioDiagnosticCode;
    message: string;
    path?: string | undefined;
    profileId?: string | undefined;
    catalogRef?: string | undefined;
    sourceRef?: string | undefined;
    actionId?: string | undefined;
}
export interface SurfaceScenarioSchemaValidationResult {
    valid: boolean;
    errors?: readonly string[] | undefined;
}
/**
 * Optional host JSON-Schema validation. The package also performs a closed
 * structural check so omitting this callback never turns malformed input into
 * an admitted scenario.
 */
export type SurfaceScenarioSchemaValidator = (value: unknown) => SurfaceScenarioSchemaValidationResult | Promise<SurfaceScenarioSchemaValidationResult>;
export interface SurfaceScenarioPayloadValidationRequest {
    profileId: string;
    descriptor: DataSourceDescriptor;
    schema: object;
    value: unknown;
}
/** Host JSON-Schema validator for loaded values whose Data Source declares a schema. */
export type SurfaceScenarioPayloadValidator = (request: SurfaceScenarioPayloadValidationRequest) => DataSourcePayloadValidationResult | Promise<DataSourcePayloadValidationResult>;
export interface ValidateSurfacePreviewScenarioInput {
    scenario: unknown;
    bundle: ResolvedBundle;
    validateSchema?: SurfaceScenarioSchemaValidator | undefined;
    validatePayload?: SurfaceScenarioPayloadValidator | undefined;
}
export type SurfaceScenarioValidationResult = {
    valid: true;
    scenario: SurfacePreviewScenario;
    diagnostics: readonly [];
} | {
    valid: false;
    diagnostics: readonly SurfaceScenarioDiagnostic[];
};
export interface SurfacePreviewRuntime {
    profileId: string;
    loader: DataSourceLoader;
    authorize: DataSourceAuthorizer;
    actionOutcome(actionId: string): SurfaceScenarioActionOutcome;
    executeTransition: TransitionExecutor;
}
/**
 * Validate one scenario against the artifacts it will preview.
 *
 * Structure, names, and exact identities fail closed. Payload schemas run only
 * when the caller supplies a validator; the Surface package deliberately does
 * not carry a second JSON-Schema implementation.
 */
export declare function validateSurfacePreviewScenario(input: ValidateSurfacePreviewScenarioInput): Promise<SurfaceScenarioValidationResult>;
/**
 * Adapt a selected scenario profile to the existing loader, authorizer, and
 * transition-executor ports. Missing profiles, missing exact source outcomes,
 * and duplicate overrides all refuse rather than falling back by source id.
 */
export declare function createSurfacePreviewRuntime(scenario: SurfacePreviewScenario, profileId?: string): SurfacePreviewRuntime;
