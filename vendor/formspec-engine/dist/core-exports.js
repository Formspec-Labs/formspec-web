/** @filedesc Render-safe public surface shared by `index.ts` and `engine-render-entry.ts` — no FEL tooling facade or tools bridge (ADR 0050 §8). */
export { DefaultValidationProfileResolver, } from './validation/index.js';
export { declaresHostEvent, findResponseActionByIntent, invokeResponseAction, InvalidValidationTupleError, missingSubmitActionFinding, resolveResponseAction, resolveResponseActionValidationTuple, validationProfileForAction, } from './response-actions.js';
export { createDemoSubmitResponseActions, } from './demo-submit-response-actions.js';
// §10 prohibits implicit-default Actions and free-string fallbacks. Renderers
// that need a submit-intent actionRef MUST call `findResponseActionByIntent`
// (exported above) and treat a null result as "no submit Action published" —
// no convenience wrapper that silently substitutes an empty string.
export { RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS, RESPONSE_ACTIONS_PRECONDITION_BINDINGS, ResponseActionsPreconditionCatalog, } from './precondition-catalog.js';
export { preactReactiveRuntime } from './reactivity/preact-runtime.js';
export { initFormspecEngine, initFormspecEngine as initEngine, initFormspecEngineTools, isFormspecEngineInitialized, isFormspecEngineToolsInitialized, } from './init-formspec-engine.js';
export { buildValidationReportEnvelope } from './engine/response-assembly.js';
export { toValidationResults } from './engine/helpers.js';
export { normalizeBcp47 } from './locale.js';
export * from './issuer/index.js';
export { FormEngine } from './engine/FormEngine.js';
export { createFormEngine } from './engine/init.js';
