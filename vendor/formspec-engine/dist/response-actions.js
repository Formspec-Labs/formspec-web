/** @filedesc Response Actions resolution helpers for renderers and hosts. */
import { VALIDATION_MAPPING_MASTER_TABLE } from '@formspec-org/types';
import { ResponseActionsPreconditionCatalog } from './precondition-catalog.js';
/**
 * Singleton precondition catalog. Spec §4.1 publishes a closed catalog of
 * six bindings; the engine consults this catalog as the default validator
 * for every precondition expression — `ports.evaluatePrecondition` becomes
 * the fallback for actual FEL evaluation, not the gate that decides whether
 * unregistered `@name` references are permitted.
 */
const DEFAULT_PRECONDITION_CATALOG = new ResponseActionsPreconditionCatalog();
/**
 * Validation tuple lookup keyed by StandardResponseActionIntent.
 * Built from the generated VM master-table const so the engine's intent
 * resolution is a projection of the schema, not a parallel literal. The
 * schema's MasterTable const is the single source of truth for this map
 * (schemas/validation-mapping.schema.json#/$defs/MasterTable/const).
 */
const MASTER_TABLE = (() => {
    const map = {};
    for (const row of VALIDATION_MAPPING_MASTER_TABLE) {
        map[row.intent] = {
            profile: row.profile,
            blocking: row.blocking,
            persistence: row.persistence,
        };
    }
    return map;
})();
function isStandardActionIntent(intent) {
    return Object.prototype.hasOwnProperty.call(MASTER_TABLE, intent);
}
/** Host finding when `onSubmit` is wired but no submit-intent Action is published. */
export function missingSubmitActionFinding() {
    return {
        code: 'COMP-REFERENTIAL-INTEGRITY',
        severity: 'error',
        kind: 'actionRef',
        target: 'submit',
        reason: 'missing-submit-action',
    };
}
function actionRefFinding(actionRef, nodeId, reason) {
    return {
        code: 'COMP-REFERENTIAL-INTEGRITY',
        severity: 'error',
        kind: 'actionRef',
        ...(nodeId ? { nodeId } : {}),
        target: actionRef,
        ...(reason ? { reason } : {}),
    };
}
export function resolveResponseAction(document, actionRef, nodeId) {
    if (!actionRef) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'missing-actionRef'),
        };
    }
    if (!document || !Array.isArray(document.actions)) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'no-response-actions-document'),
        };
    }
    const action = document.actions.find(candidate => candidate?.id === actionRef) ?? null;
    if (!action) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId),
        };
    }
    return { resolved: true, action };
}
export function findResponseActionByIntent(document, intent) {
    if (!document || !Array.isArray(document.actions)) {
        return null;
    }
    return document.actions.find(action => action?.intent === intent) ?? null;
}
/**
 * Structured error thrown when an explicit `action.validation` override
 * fails the VM §6.3 closed-tuple predicate. The `code` mirrors the Rust
 * lint pass identifier (formspec-lint VMAP-INVALID-OVERRIDE) so runtime
 * findings line up with static-analysis output.
 */
export class InvalidValidationTupleError extends Error {
    constructor(actionId, override, message) {
        super(message);
        this.code = 'VMAP-INVALID-OVERRIDE';
        this.name = 'InvalidValidationTupleError';
        this.actionId = actionId;
        this.override = override;
    }
}
const REQUIRED_TUPLE_KEYS = ['profile', 'blocking', 'persistence'];
const VALIDATION_PROFILES = new Set(['live', 'on-submit', 'on-demand', 'off']);
const BLOCKING_POLICIES = new Set(['non-blocking', 'block-on-error']);
const PERSISTENCE_POLICIES = new Set(['none', 'draft-checkpoint', 'complete-response']);
function overrideErrorPayload(candidate) {
    return candidate && typeof candidate === 'object'
        ? candidate
        : { validation: candidate };
}
function assertClosedTupleValue(actionId, overrideRecord, key, value, allowed) {
    if (typeof value !== 'string') {
        throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' validation override missing required key '${key}' (VM §6.3 requires the full closed (profile, blocking, persistence) tuple).`);
    }
    if (!allowed.has(value)) {
        throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' validation override has invalid ${key} '${value}' (VM §6.3 requires values from the closed Validation Mapping vocabularies).`);
    }
}
/**
 * Enforces VM §6.3 on a present validation override. The schema gate normally
 * catches this, but a host that supplies runtime objects directly (skipping
 * schema validation) MUST still be rejected here.
 */
function assertValidationTupleValid(actionId, candidate) {
    const overrideRecord = overrideErrorPayload(candidate);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' validation override must be an object carrying the closed (profile, blocking, persistence) tuple.`);
    }
    const { profile, blocking, persistence } = overrideRecord;
    assertClosedTupleValue(actionId, overrideRecord, 'profile', profile, VALIDATION_PROFILES);
    assertClosedTupleValue(actionId, overrideRecord, 'blocking', blocking, BLOCKING_POLICIES);
    assertClosedTupleValue(actionId, overrideRecord, 'persistence', persistence, PERSISTENCE_POLICIES);
    // VM §6.3: NOT (profile=off AND blocking=block-on-error)
    if (profile === 'off' && blocking === 'block-on-error') {
        throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' violates VM §6.3 clause 3: profile=off cannot combine with blocking=block-on-error.`);
    }
    // VM §6.3: persistence=complete-response => profile=on-submit AND blocking=block-on-error
    if (persistence === 'complete-response') {
        if (profile !== 'on-submit') {
            throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' violates VM §6.3 clause 1: persistence=complete-response requires profile=on-submit (got '${profile}').`);
        }
        if (blocking !== 'block-on-error') {
            throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' violates VM §6.3 clause 1: persistence=complete-response requires blocking=block-on-error (got '${blocking}').`);
        }
    }
    // VM §6.3: blocking=block-on-error => persistence=complete-response
    if (blocking === 'block-on-error' && persistence !== 'complete-response') {
        throw new InvalidValidationTupleError(actionId, overrideRecord, `Response Action '${actionId}' violates VM §6.3 clause 2: blocking=block-on-error requires persistence=complete-response (got '${persistence}').`);
    }
    return { profile, blocking, persistence };
}
export function resolveResponseActionValidationTuple(action) {
    if (Object.prototype.hasOwnProperty.call(action, 'validation')) {
        const override = action.validation;
        // VM §6.3 predicate enforcement: a schema-bypassing host (or a
        // malformed in-memory document) MUST be rejected with a structured
        // code so finding-aware UIs and the static lint pass align.
        return assertValidationTupleValid(action.id, override);
    }
    const intent = action.intent;
    if (isStandardActionIntent(intent)) {
        return MASTER_TABLE[intent];
    }
    throw new Error(`Response Action '${action.id}' with intent '${intent}' requires an explicit validation tuple`);
}
export function validationProfileForAction(action) {
    return resolveResponseActionValidationTuple(action).profile;
}
export function declaresHostEvent(action, eventName) {
    return (action.effects ?? []).some((effect) => effect.type === 'hostEvent' && effect.eventName === eventName);
}
function inferValidationReportValid(detail, ports) {
    const fromPort = ports.validationReportValid?.(detail);
    if (typeof fromPort === 'boolean') {
        return fromPort;
    }
    if (!detail || typeof detail !== 'object') {
        return null;
    }
    const report = detail.validationReport;
    return typeof report?.valid === 'boolean' ? report.valid : null;
}
function preconditionPassed(result) {
    return typeof result === 'boolean' ? result : result.passed;
}
function preconditionReason(result) {
    return typeof result === 'boolean' ? undefined : result.reason;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isDurableEffect(effect) {
    return effect.type !== 'hostEvent';
}
function effectErrorPolicy(effect) {
    if ('onError' in effect && (effect.onError === 'fail' || effect.onError === 'defer')) {
        return effect.onError;
    }
    return effect.type === 'evidenceRequest' ? 'defer' : 'fail';
}
function normalizeEffectOutcome(effect, outcome, idempotencyKey) {
    const fallback = { type: effect.type };
    if (!outcome) {
        return {
            ...fallback,
            status: 'succeeded',
            ...(idempotencyKey ? { idempotencyKey } : {}),
        };
    }
    return {
        ...fallback,
        ...outcome,
        type: effect.type,
        ...(idempotencyKey ? { idempotencyKey } : {}),
    };
}
function effectWithIdempotencyKey(effect, idempotencyKey) {
    if (!idempotencyKey || !isDurableEffect(effect)) {
        return effect;
    }
    return { ...effect, idempotencyKey };
}
/**
 * Static lint at runtime: warn when an idempotencyKey expression carries
 * no FEL `@`-binding. A literal-string expression (e.g., `"static-key"`)
 * is schema-valid but produces the same key for every invocation — hosts
 * that dedupe by key silently drop legitimate later invocations. Spec §6.3
 * expects an expression referencing at least one of @invocation, @action,
 * @effects, etc. The Rust lint pass `pass_response_actions` emits W1802 at
 * authoring time; the runtime emits console.warn so authors catch it even
 * when the lint hasn't run (e.g., dynamic document construction in tests).
 */
function maybeWarnAboutStaticIdempotencyKey(actionId, effectIndex, keyExpression) {
    if (typeof keyExpression !== 'string')
        return;
    if (keyExpression.includes('@'))
        return;
    // eslint-disable-next-line no-console
    console.warn(`[formspec-engine] Response Action '${actionId}' effect[${effectIndex}] idempotencyKey expression `
        + `does not reference any @-binding (got "${keyExpression}"). A literal-string idempotencyKey `
        + `produces the same key for every invocation, defeating idempotency. Use a FEL expression like `
        + `"@invocation.id & '/<effect-name>'" so the key varies per invocation.`);
}
let invocationCounter = 0;
function synthesizeInvocationId() {
    invocationCounter += 1;
    return `inv-${Date.now().toString(36)}-${invocationCounter.toString(36)}`;
}
export function invokeResponseAction(document, actionRef, ports, nodeId, invocationContext) {
    const resolution = resolveResponseAction(document, actionRef, nodeId);
    if (!resolution.resolved || !resolution.action) {
        return {
            status: 'unresolved',
            resolution,
            validationTuple: null,
            detail: null,
            effectTrace: [],
            ...(resolution.finding ? { finding: resolution.finding } : {}),
        };
    }
    const invocationId = invocationContext?.invocationId ?? synthesizeInvocationId();
    const priorInvocationRef = invocationContext?.priorInvocationRef;
    const actionId = resolution.action.id;
    const emitLifecycle = (kind, extra = {}) => {
        if (!ports.recordActionLifecycle)
            return;
        const payload = {
            actionId,
            invocationId,
            attempt: extra.attempt ?? 1,
            ...extra,
        };
        ports.recordActionLifecycle(kind, payload);
    };
    // §11.3 begin-of-invocation lifecycle moment. action.replayed when the
    // host signals continuation via priorInvocationRef; otherwise action.invoked.
    if (priorInvocationRef) {
        emitLifecycle('action.replayed', { priorInvocationRef });
    }
    else {
        emitLifecycle('action.invoked');
    }
    const validationTuple = resolveResponseActionValidationTuple(resolution.action);
    for (const precondition of resolution.action.preconditions ?? []) {
        // §4.1 catalog gate: unregistered @name references are rejected
        // before host evaluation. Host evaluators MUST honor this catalog
        // (fel-core/src/evaluator/core.rs ContextBindingCatalog trait); the
        // lexical check here ensures the contract is enforced even when the
        // host installs a permissive evaluator.
        const catalogCheck = DEFAULT_PRECONDITION_CATALOG.validateExpression(precondition.expression ?? '');
        if (!catalogCheck.ok) {
            return {
                status: 'failed',
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
                failedPreconditionId: precondition.id,
                failureReason: `unbound context reference: @${catalogCheck.unbound.join(', @')}`,
            };
        }
        if (!ports.evaluatePrecondition) {
            return {
                status: 'failed',
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
                failedPreconditionId: precondition.id,
                failureReason: 'missing precondition evaluator',
            };
        }
        let preconditionResult;
        try {
            preconditionResult = ports.evaluatePrecondition(precondition, resolution.action);
        }
        catch (error) {
            return {
                status: 'failed',
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
                failedPreconditionId: precondition.id,
                failureReason: errorMessage(error),
            };
        }
        if (preconditionPassed(preconditionResult)) {
            continue;
        }
        if (precondition.severity === 'defer') {
            return {
                status: 'deferred',
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
                deferredPreconditionId: precondition.id,
                failureReason: preconditionReason(preconditionResult),
            };
        }
        return {
            status: 'blocked',
            resolution,
            validationTuple,
            detail: null,
            effectTrace: [],
            blockedCause: 'precondition',
            blockedPreconditionId: precondition.id,
            failureReason: preconditionReason(preconditionResult),
        };
    }
    const detail = ports.submit({
        profile: validationTuple.profile,
        validationTuple,
        emitEvent: false,
    });
    if (!detail) {
        return {
            status: 'failed',
            resolution,
            validationTuple,
            detail: null,
            effectTrace: [],
            failureReason: 'submit adapter returned no detail',
        };
    }
    const validationValid = inferValidationReportValid(detail, ports);
    if (validationTuple.profile !== 'off' && validationValid === null) {
        return {
            status: 'failed',
            resolution,
            validationTuple,
            detail,
            effectTrace: [],
            failureReason: 'validation report missing valid flag',
        };
    }
    if (validationTuple.blocking === 'block-on-error' && validationValid === false) {
        return {
            status: 'blocked',
            resolution,
            validationTuple,
            detail,
            effectTrace: [],
            blockedCause: 'validation',
        };
    }
    const effectTrace = [];
    const frozenIdempotencyKeys = new Map();
    const retriedEffects = new Set();
    const effects = resolution.action.effects ?? [];
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        let attempt = 0;
        while (true) {
            let idempotencyKey;
            let effectForDispatch = effect;
            let outcome;
            try {
                if (isDurableEffect(effect)) {
                    idempotencyKey = frozenIdempotencyKeys.get(effectIndex);
                    if (!idempotencyKey) {
                        // Warn once per effect (only on first attempt) when the
                        // author-supplied expression is a literal string with no
                        // @-binding. Idempotency depends on the key varying.
                        maybeWarnAboutStaticIdempotencyKey(actionId, effectIndex, effect.idempotencyKey);
                        if (!ports.resolveIdempotencyKey) {
                            throw new Error('missing idempotency key resolver');
                        }
                        idempotencyKey = ports.resolveIdempotencyKey(effect, resolution.action, { effectIndex });
                        if (!idempotencyKey) {
                            throw new Error('idempotency key resolver returned an empty key');
                        }
                        frozenIdempotencyKeys.set(effectIndex, idempotencyKey);
                    }
                    effectForDispatch = effectWithIdempotencyKey(effect, idempotencyKey);
                }
                if (effect.type === 'hostEvent' && typeof effect.eventName === 'string') {
                    ports.dispatchHostEvent(effect.eventName, detail, resolution.action);
                    outcome = normalizeEffectOutcome(effect, undefined);
                }
                else if (!ports.dispatchEffect) {
                    outcome = {
                        type: effect.type,
                        status: 'failed',
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                        reason: 'missing effect dispatcher',
                    };
                }
                else {
                    outcome = normalizeEffectOutcome(effect, ports.dispatchEffect(effectForDispatch, detail, resolution.action, {
                        effectIndex,
                        attempt,
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    }), idempotencyKey);
                }
            }
            catch (error) {
                outcome = {
                    type: effect.type,
                    status: 'failed',
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                    reason: errorMessage(error),
                };
            }
            effectTrace.push(outcome);
            if (outcome.status === 'succeeded' || outcome.status === 'replayed') {
                break;
            }
            const deferred = outcome.status === 'deferred' || effectErrorPolicy(effect) === 'defer';
            if (deferred) {
                emitLifecycle('action.deferred', {
                    terminal: 'deferred',
                    effectIndex,
                    attempt: attempt + 1,
                    ...(outcome.replayToken ? { replayTokenRef: outcome.replayToken } : {}),
                    ...(outcome.reason ? { causeRef: outcome.reason } : {}),
                });
                return {
                    status: 'deferred',
                    resolution,
                    validationTuple,
                    detail,
                    effectTrace,
                    deferredEffectIndex: effectIndex,
                    replayToken: outcome.replayToken,
                    failureReason: outcome.reason,
                };
            }
            if (resolution.action.onFailure === 'retry-once' && !retriedEffects.has(effectIndex)) {
                retriedEffects.add(effectIndex);
                attempt += 1;
                continue;
            }
            emitLifecycle('action.failed', {
                terminal: 'failed',
                effectIndex,
                attempt: attempt + 1,
                ...(outcome.reason ? { causeRef: outcome.reason } : {}),
            });
            return {
                status: 'failed',
                resolution,
                validationTuple,
                detail,
                effectTrace,
                failedEffectIndex: effectIndex,
                failureReason: outcome.reason,
            };
        }
    }
    return {
        status: 'completed',
        resolution,
        validationTuple,
        detail,
        effectTrace,
    };
}
