/** @filedesc Render-safe public surface shared by `index.ts` and `engine-render-entry.ts` — no FEL tooling facade or tools bridge (ADR 0050 §8). */
export { isStamped, matchesEntry, sameAnswer, } from './engine/warning-explanations.js';
export { DefaultValidationProfileResolver, } from './validation/index.js';
export { APP_ACTION_VALIDATION_TUPLE, autoPlacedDefinitionActions, classifyResponseActionEffect, createResponseActionAutosaveController, declaresHostEvent, findAutosaveResponseAction, findResponseActionByIntent, invokeResponseAction, invokeResponseActionAsync, isAppActionValidationTuple, isBackgroundResponseAction, isDurableResponseActionEffect, isValidDefinitionResponseActionsDocument, isValidResponseActionIntent, InvalidValidationTupleError, missingSubmitActionFinding, planResponseActionEffects, planResponseActionInvocation, resolveAutosaveResponseAction, resolveResponseAction, resolveResponseActionValidationTuple, subscribeResponseActionAutosave, validationProfileForAction, } from './response-actions.js';
export { extractServiceRequestOutputs, isPlainJsonArray, isPlainJsonObject, planServiceRequest, resolveRuntimeValueSelector, resolveServiceRequest, ServiceRequestRuntimeError, } from './service-request-runtime.js';
export { createDemoSubmitResponseActions, } from './demo-submit-response-actions.js';
// §10 prohibits implicit-default Actions and free-string fallbacks. Renderers
// that need a submit-intent actionRef MUST call `findResponseActionByIntent`
// (exported above) and treat a null result as "no submit Action published" —
// no convenience wrapper that silently substitutes an empty string.
export { RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS, RESPONSE_ACTIONS_PRECONDITION_BINDINGS, ResponseActionsPreconditionCatalog, } from './precondition-catalog.js';
export { preactReactiveRuntime } from './reactivity/preact-runtime.js';
export { initFormspecEngine, initFormspecEngine as initEngine, initFormspecEngineTools, isFormspecEngineInitialized, isFormspecEngineToolsInitialized, } from './init-formspec-engine.js';
export { attachAuthoredSignature, buildValidationReportEnvelope } from './engine/response-assembly.js';
export { deepEqual, toValidationResults } from './engine/helpers.js';
export { normalizeBcp47, LocaleStore } from './locale.js';
export { createScreenerLocaleResolver, screenerOptionLocaleKey } from './screener-locale.js';
export * from './issuer/index.js';
export { FormEngine } from './engine/FormEngine.js';
export { createFormEngine } from './engine/init.js';
export { resolveAuthoredSigningContent, signingContentBytes, hashSigningContent } from './signing-content.js';
export { jsonNumberText, parseJsonNumber, jsonValueText } from './json-values.js';
export { clampJsonNumber, stepJsonNumber } from './numeric-input.js';
export { cloneValue as cloneJsonValue } from './json-values.js';
export { wasmCreateResponse as createResponse, wasmCreateRepeatRow as createRepeatRow } from './wasm-bridge-runtime.js';
/**
 * Core's filing-unit id from a subject type and typed keys, using runtime WASM only. For hosts that
 * key storage by subject before an engine exists; `FormEngine` derives `Response.subject.id` itself.
 */
export { wasmResponseSubjectId as responseSubjectId } from './wasm-bridge-runtime.js';
