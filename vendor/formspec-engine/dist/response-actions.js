/** @filedesc Response Actions resolution helpers for renderers and hosts. */
import { cloneValue, deepEqual } from './json-values.js';
import { preactReactiveRuntime } from './reactivity/preact-runtime.js';
import { targetDefinitionMatches, VALIDATION_MAPPING_MASTER_TABLE } from '@formspec-org/types';
import { ResponseActionsPreconditionCatalog } from './precondition-catalog.js';
import { isPlainJsonArray, isPlainJsonObject, isValidPlainJsonValue } from './service-request-runtime.js';
import { getDraftEditVersionSignal } from './engine/draft-edit-signal.js';
/**
 * Singleton precondition catalog. Spec §4.1 publishes a closed catalog of
 * six bindings; the engine consults this catalog as the default validator
 * for every precondition expression — `ports.evaluatePrecondition` becomes
 * the fallback for actual FEL evaluation, not the gate that decides whether
 * unregistered `@name` references are permitted.
 */
const DEFAULT_PRECONDITION_CATALOG = new ResponseActionsPreconditionCatalog();
/**
 * The only validation tuple an app-scoped Action may declare.
 *
 * App actions have no Response to validate or persist. Keeping this predicate
 * next to the executor prevents build-time gates from restating a runtime
 * invariant with subtly different defaults.
 */
export const APP_ACTION_VALIDATION_TUPLE = Object.freeze({
    profile: 'off',
    blocking: 'non-blocking',
    persistence: 'none',
});
export function isAppActionValidationTuple(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const tuple = value;
    return tuple.profile === APP_ACTION_VALIDATION_TUPLE.profile
        && tuple.blocking === APP_ACTION_VALIDATION_TUPLE.blocking
        && tuple.persistence === APP_ACTION_VALIDATION_TUPLE.persistence;
}
/**
 * Pure owner classification used by executors and admission gates.
 *
 * Unknown effect types are treated as durable. That fail-closed default means
 * a schema-bypassing caller cannot obtain side effects merely by inventing a
 * new transient-looking type.
 */
export function classifyResponseActionEffect(effect) {
    const type = effect.type;
    if (type === 'hostEvent')
        return 'transient';
    if (type === 'browserResource')
        return 'browser-local';
    return 'durable';
}
export function isDurableResponseActionEffect(effect) {
    return classifyResponseActionEffect(effect) === 'durable';
}
/** Pure, ordered effect plan. It never evaluates, dispatches, or authorizes. */
export function planResponseActionEffects(action) {
    return (action.effects ?? []).map((effect, effectIndex) => ({
        effectIndex,
        effect,
        effectClass: classifyResponseActionEffect(effect),
        durable: isDurableResponseActionEffect(effect),
    }));
}
function immutableSnapshot(value) {
    const snapshot = cloneValue(value);
    const seen = new WeakSet();
    const freeze = (item) => {
        if (!item || typeof item !== 'object' || seen.has(item))
            return;
        seen.add(item);
        for (const child of Object.values(item))
            freeze(child);
        Object.freeze(item);
    };
    freeze(snapshot);
    return snapshot;
}
/** Capture once, before preceding effects can mutate the invocation input. */
function hostEventDetailResolver(detail, action, ports, invocationId) {
    let snapshot;
    let snapshotError;
    if (action.effects?.some(effect => effect.type === 'hostEvent' && effect.detailRef !== undefined)) {
        try {
            snapshot = immutableSnapshot({ detail, action });
        }
        catch (error) {
            snapshotError = error;
        }
    }
    return (effect, effectIndex, attempt, effects) => {
        if (effect.detailRef === undefined)
            return detail;
        if (snapshotError)
            throw snapshotError;
        if (!snapshot || !ports.evaluateEffectExpression)
            throw new Error('missing effect expression evaluator');
        const value = ports.evaluateEffectExpression(effect.detailRef, snapshot.detail, snapshot.action, immutableSnapshot({ effectIndex, invocation: { id: invocationId, attempt: attempt + 1 }, effects: effects.slice(0, effectIndex) }));
        if (isPromiseLike(value)) {
            void Promise.resolve(value).catch(() => undefined);
            throw new Error('effect expression evaluator must be synchronous');
        }
        return value;
    };
}
/**
 * Validation tuple lookup keyed by StandardResponseActionIntent.
 * Built from the generated VM master-table const so the engine's intent
 * resolution is a projection of the closed-core VM fixture, not a parallel
 * literal. The JCS fixture is the single source of truth for these rows.
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
    const actions = document.actions.filter(candidate => candidate?.id === actionRef);
    if (actions.length === 0) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId),
        };
    }
    if (actions.length > 1) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'ambiguous-actionRef'),
        };
    }
    return { resolved: true, action: actions[0] };
}
/**
 * Resolve an Action and expose its complete effect plan without executing it.
 * Admission layers use this before activation so all possible durable effects
 * can be authorized as one fail-closed decision.
 */
export function planResponseActionInvocation(document, actionRef, nodeId) {
    const resolution = resolveResponseAction(document, actionRef, nodeId);
    return {
        resolution,
        effects: resolution.action ? planResponseActionEffects(resolution.action) : [],
    };
}
export function findResponseActionByIntent(document, intent) {
    if (!document || !Array.isArray(document.actions)) {
        return null;
    }
    return document.actions.find(action => action?.intent === intent) ?? null;
}
const RESPONSE_ACTION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const EXTENSION_ACTION_INTENT_PATTERN = /^x-(?!(?:save-draft|autosave|review|submit|request-evidence)$)[A-Za-z0-9_-]+$/;
const DOCUMENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MODULE_ID_PATTERN = /^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/;
const MODULE_LOCK_HASH_PATTERN = /^[a-z0-9]+:[A-Za-z0-9+/=]+$/;
const ACTOR_ID_PATTERN = /^urn:formspec:actor:.+/;
const GENERATION_ANCHOR_PATTERN = /^(item|unit|task|action|concept|need):.+$/;
const HANDLE_OR_ROUTE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const PROVENANCE_NODE_PATH_PATTERN = /^\/.+/;
const ASCII_ONLY_PATTERN = /^[\x00-\x7F]+$/;
const RFC3986_URI_PATTERN = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
const BROWSER_RESOURCE_REF_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const OUTPUT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const JSON_POINTER_NON_ROOT_PATTERN = /^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])*)*$/;
const PATH_TEMPLATE_PATTERN = /^\/(?!\/)/;
const PATH_BINDING_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const QUERY_BINDING_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const HEADER_BINDING_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SELECTOR_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/;
const DOCUMENT_ALLOWED_KEYS = new Set([
    '$formspecResponseActions',
    'modules',
    'version',
    'name',
    'title',
    'description',
    'scope',
    'targetDefinition',
    'actions',
    'x-formspec-runtime',
]);
const TARGET_DEFINITION_KEYS = new Set(['url', 'compatibleVersions']);
const MODULE_REF_KEYS = new Set(['id', 'version', 'publisher', 'lockHash', 'extensions']);
const AUTHOR_ACTOR_KEYS = new Set(['id', 'kind', 'actChannel', 'display', 'extensions']);
const COMPONENT_NODE_IDENTITY_KEYS = new Set(['component', 'surface', 'route', 'nodePath', 'id', 'nodeId']);
const COMPONENT_REF_KEYS = new Set(['handle', 'url', 'version']);
const SURFACE_REF_KEYS = new Set(['url', 'version']);
const CROSS_COMPONENT_REF_KEYS = new Set(['route', 'nodePath']);
const ACTION_ALLOWED_KEYS = new Set([
    'id',
    'intent',
    'actor',
    'label',
    'x-generation',
    'preconditions',
    'validation',
    'effects',
    'onFailure',
    'onDeferred',
]);
const PRECONDITION_KEYS = new Set(['id', 'expression', 'severity']);
const VALIDATION_OVERRIDE_KEYS = new Set(['profile', 'blocking', 'persistence']);
const MAPPING_EFFECT_KEYS = new Set(['type', 'mappingRef', 'idempotencyKey', 'onError']);
const LEDGER_EFFECT_KEYS = new Set(['type', 'eventKind', 'payloadRef', 'idempotencyKey', 'onError']);
const HANDOFF_EFFECT_KEYS = new Set(['type', 'handoffProfileRef', 'recipientRef', 'idempotencyKey', 'onError']);
const REQUEST_REF_EFFECT_KEYS = new Set(['type', 'requestRef', 'idempotencyKey', 'onError']);
const HOST_EVENT_EFFECT_KEYS = new Set(['type', 'eventName', 'detailRef']);
const BROWSER_RESOURCE_EFFECT_KEYS = new Set(['type', 'operation', 'resourceRef', 'target', 'onError']);
const RUNTIME_CATALOG_KEYS = new Set(['version', 'requests']);
const RUNTIME_REQUEST_KEYS = new Set([
    'id',
    'adapter',
    'operation',
    'request',
    'successStatuses',
    'outputs',
    'x-generation',
]);
const HTTP_JSON_REQUEST_KEYS = new Set([
    'method',
    'pathTemplate',
    'pathBindings',
    'queryBindings',
    'headerBindings',
    'bodyDefaults',
    'bodyBindings',
]);
const RUNTIME_VALUE_SELECTOR_KEYS = new Set(['from', 'path', 'value']);
const RUNTIME_OUTPUT_KEYS = new Set(['path', 'exposure']);
/**
 * Whether `intent` conforms to `schemas/response-actions.schema.json` `#/$defs/ActionIntent`:
 * either a closed standard Validation Mapping intent or an `x-` publisher extension that
 * does not shadow a standard intent.
 */
export function isValidResponseActionIntent(intent) {
    return typeof intent === 'string' && (isStandardActionIntent(intent)
        || EXTENSION_ACTION_INTENT_PATTERN.test(intent));
}
function asRecord(value) {
    if (!isPlainJsonObject(value))
        return null;
    if (Object.getOwnPropertySymbols(value).length > 0)
        return null;
    const out = Object.create(null);
    for (const key of Object.getOwnPropertyNames(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
            return null;
        }
        out[key] = descriptor.value;
    }
    return out;
}
function hasMinLength1(value) {
    return typeof value === 'string' && value.length >= 1;
}
function hasNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function isValidRfc3986Uri(value) {
    return typeof value === 'string'
        && value.length >= 1
        && ASCII_ONLY_PATTERN.test(value)
        && (value.includes(':') || value.includes('/'))
        && RFC3986_URI_PATTERN.test(value);
}
function hasOnlyAllowedKeys(record, allowed, allowXPrefix = false) {
    for (const key of Object.keys(record)) {
        if (allowed.has(key))
            continue;
        if (allowXPrefix && key.startsWith('x-'))
            continue;
        return false;
    }
    return true;
}
function isValidExtensions(value) {
    const ext = asRecord(value);
    if (!ext)
        return false;
    return Object.keys(ext).every((key) => key.startsWith('x-'));
}
function isValidModuleRef(value) {
    const mod = asRecord(value);
    if (!mod || !hasOnlyAllowedKeys(mod, MODULE_REF_KEYS))
        return false;
    return typeof mod.id === 'string'
        && MODULE_ID_PATTERN.test(mod.id)
        && hasMinLength1(mod.version)
        && (mod.publisher === undefined || isValidRfc3986Uri(mod.publisher))
        && (mod.lockHash === undefined || (typeof mod.lockHash === 'string' && MODULE_LOCK_HASH_PATTERN.test(mod.lockHash)))
        && (mod.extensions === undefined || isValidExtensions(mod.extensions));
}
function isValidAuthorActor(value) {
    const actor = asRecord(value);
    if (!actor || !hasOnlyAllowedKeys(actor, AUTHOR_ACTOR_KEYS))
        return false;
    return typeof actor.id === 'string'
        && ACTOR_ID_PATTERN.test(actor.id)
        && (actor.kind === 'human' || actor.kind === 'ai-agent' || actor.kind === 'service')
        && (actor.actChannel === 'human' || actor.actChannel === 'mcp' || actor.actChannel === 'agent' || actor.actChannel === 'service')
        && (actor.display === undefined || typeof actor.display === 'string')
        && (actor.extensions === undefined || isValidExtensions(actor.extensions));
}
function isValidProvenanceRef(value) {
    const candidate = asRecord(value);
    if (!candidate)
        return false;
    if (hasOnlyAllowedKeys(candidate, CROSS_COMPONENT_REF_KEYS)
        && typeof candidate.route === 'string'
        && typeof candidate.nodePath === 'string') {
        return true;
    }
    if (!hasOnlyAllowedKeys(candidate, COMPONENT_NODE_IDENTITY_KEYS))
        return false;
    const comp = asRecord(candidate.component);
    const surf = asRecord(candidate.surface);
    return Boolean(comp
        && hasOnlyAllowedKeys(comp, COMPONENT_REF_KEYS)
        && typeof comp.handle === 'string'
        && HANDLE_OR_ROUTE_ID_PATTERN.test(comp.handle)
        && (comp.url === undefined || isValidRfc3986Uri(comp.url))
        && (comp.version === undefined || hasMinLength1(comp.version))
        && surf
        && hasOnlyAllowedKeys(surf, SURFACE_REF_KEYS)
        && isValidRfc3986Uri(surf.url)
        && (surf.version === undefined || hasMinLength1(surf.version))
        && typeof candidate.route === 'string'
        && HANDLE_OR_ROUTE_ID_PATTERN.test(candidate.route)
        && typeof candidate.nodePath === 'string'
        && PROVENANCE_NODE_PATH_PATTERN.test(candidate.nodePath)
        && (candidate.id === undefined || hasMinLength1(candidate.id))
        && (candidate.nodeId === undefined || hasMinLength1(candidate.nodeId)));
}
function everyDenseElement(value, predicate) {
    if (!isPlainJsonArray(value))
        return false;
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            return false;
        }
        if (!predicate(descriptor.value, index))
            return false;
    }
    return true;
}
function ownDataProperty(record, key) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return { present: false, value: undefined };
    }
    return { present: true, value: descriptor.value };
}
function isValidGeneration(value) {
    const gen = asRecord(value);
    if (!gen)
        return false;
    return (gen.source === undefined || typeof gen.source === 'string')
        && (gen.strategy === undefined || typeof gen.strategy === 'string')
        && (gen.generatedAt === undefined || typeof gen.generatedAt === 'string')
        && (gen.anchors === undefined
            || everyDenseElement(gen.anchors, (anchor) => typeof anchor === 'string' && GENERATION_ANCHOR_PATTERN.test(anchor)))
        && (gen.generatedBy === undefined || typeof gen.generatedBy === 'string' || isValidAuthorActor(gen.generatedBy))
        && (gen.sourceModule === undefined || isValidModuleRef(gen.sourceModule))
        && (gen.movedFrom === undefined || isValidProvenanceRef(gen.movedFrom))
        && (gen.copiedFrom === undefined || isValidProvenanceRef(gen.copiedFrom))
        && (gen.extensions === undefined || isValidExtensions(gen.extensions));
}
function isValidRuntimeValueSelector(value) {
    const selector = asRecord(value);
    if (!selector || !hasOnlyAllowedKeys(selector, RUNTIME_VALUE_SELECTOR_KEYS))
        return false;
    const from = selector.from;
    if (from === 'literal') {
        const valueProp = ownDataProperty(selector, 'value');
        return valueProp.present
            && valueProp.value !== undefined
            && !Object.prototype.hasOwnProperty.call(selector, 'path')
            && isValidPlainJsonValue(valueProp.value);
    }
    if (from === 'input' || from === 'route' || from === 'session' || from === 'result') {
        return typeof selector.path === 'string'
            && SELECTOR_PATH_PATTERN.test(selector.path)
            && !Object.prototype.hasOwnProperty.call(selector, 'value');
    }
    return false;
}
function isValidSelectorMap(value, keyPattern) {
    const record = asRecord(value);
    if (!record)
        return false;
    for (const key of Object.keys(record)) {
        const prop = ownDataProperty(record, key);
        if (!prop.present || !keyPattern.test(key) || !isValidRuntimeValueSelector(prop.value)) {
            return false;
        }
    }
    return true;
}
function isValidHttpJsonRequest(value) {
    const req = asRecord(value);
    if (!req || !hasOnlyAllowedKeys(req, HTTP_JSON_REQUEST_KEYS))
        return false;
    const bodyDefaultsProp = ownDataProperty(req, 'bodyDefaults');
    const bodyDefaultsValid = !Object.prototype.hasOwnProperty.call(req, 'bodyDefaults')
        || (bodyDefaultsProp.present && (bodyDefaultsProp.value === undefined
            || (isPlainJsonObject(bodyDefaultsProp.value) && isValidPlainJsonValue(bodyDefaultsProp.value))));
    return (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')
        && typeof req.pathTemplate === 'string'
        && PATH_TEMPLATE_PATTERN.test(req.pathTemplate)
        && (req.pathBindings === undefined || isValidSelectorMap(req.pathBindings, PATH_BINDING_NAME_PATTERN))
        && (req.queryBindings === undefined || isValidSelectorMap(req.queryBindings, QUERY_BINDING_NAME_PATTERN))
        && (req.headerBindings === undefined || isValidSelectorMap(req.headerBindings, HEADER_BINDING_NAME_PATTERN))
        && bodyDefaultsValid
        && (req.bodyBindings === undefined || isValidSelectorMap(req.bodyBindings, JSON_POINTER_NON_ROOT_PATTERN));
}
function isValidRuntimeRequestOutput(value) {
    const out = asRecord(value);
    if (!out || !hasOnlyAllowedKeys(out, RUNTIME_OUTPUT_KEYS))
        return false;
    return typeof out.path === 'string'
        && JSON_POINTER_NON_ROOT_PATTERN.test(out.path)
        && (out.exposure === undefined
            || out.exposure === 'internal'
            || out.exposure === 'transition'
            || out.exposure === 'session');
}
function isValidRuntimeRequestCatalog(value) {
    const catalog = asRecord(value);
    if (!catalog
        || !hasOnlyAllowedKeys(catalog, RUNTIME_CATALOG_KEYS)
        || catalog.version !== '1.0'
        || !Array.isArray(catalog.requests)
        || catalog.requests.length === 0) {
        return false;
    }
    const requestIds = new Set();
    if (!everyDenseElement(catalog.requests, (raw) => {
        const entry = asRecord(raw);
        if (!entry
            || !hasOnlyAllowedKeys(entry, RUNTIME_REQUEST_KEYS)
            || typeof entry.id !== 'string'
            || !RESPONSE_ACTION_ID_PATTERN.test(entry.id)
            || requestIds.has(entry.id)
            || entry.adapter !== 'http-json'
            || (entry.operation !== undefined && entry.operation !== 'prepare' && entry.operation !== 'sign')
            || !isValidHttpJsonRequest(entry.request)
            || (entry['x-generation'] !== undefined && !isValidGeneration(entry['x-generation']))) {
            return false;
        }
        if (entry.successStatuses !== undefined) {
            if (!Array.isArray(entry.successStatuses) || entry.successStatuses.length === 0)
                return false;
            const seenStatuses = new Set();
            if (!everyDenseElement(entry.successStatuses, (status) => {
                if (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status > 299 || seenStatuses.has(status)) {
                    return false;
                }
                seenStatuses.add(status);
                return true;
            })) {
                return false;
            }
        }
        if (entry.outputs !== undefined) {
            const outputs = asRecord(entry.outputs);
            if (!outputs)
                return false;
            for (const name of Object.keys(outputs)) {
                const prop = ownDataProperty(outputs, name);
                if (!prop.present || !OUTPUT_NAME_PATTERN.test(name) || !isValidRuntimeRequestOutput(prop.value)) {
                    return false;
                }
            }
        }
        requestIds.add(entry.id);
        return true;
    })) {
        return false;
    }
    return true;
}
function isValidPrecondition(value) {
    const precondition = asRecord(value);
    if (!precondition || !hasOnlyAllowedKeys(precondition, PRECONDITION_KEYS))
        return false;
    return hasMinLength1(precondition.id)
        && hasMinLength1(precondition.expression)
        && (precondition.severity === 'block' || precondition.severity === 'defer');
}
function isValidOnError(value) {
    return value === undefined || value === 'fail' || value === 'defer';
}
function hasValidResponseActionEffectShape(value) {
    const effect = asRecord(value);
    if (!effect || typeof effect.type !== 'string')
        return false;
    switch (effect.type) {
        case 'mappingExecution':
            return hasOnlyAllowedKeys(effect, MAPPING_EFFECT_KEYS)
                && hasMinLength1(effect.mappingRef)
                && hasMinLength1(effect.idempotencyKey)
                && isValidOnError(effect.onError);
        case 'ledgerAppend':
            return hasOnlyAllowedKeys(effect, LEDGER_EFFECT_KEYS)
                && hasMinLength1(effect.eventKind)
                && effect.eventKind !== 'case.created'
                && !effect.eventKind.startsWith('case.')
                && !effect.eventKind.startsWith('action.')
                && (effect.payloadRef === undefined || typeof effect.payloadRef === 'string')
                && hasMinLength1(effect.idempotencyKey)
                && isValidOnError(effect.onError);
        case 'handoffAssembly':
            return hasOnlyAllowedKeys(effect, HANDOFF_EFFECT_KEYS)
                && hasMinLength1(effect.handoffProfileRef)
                && hasMinLength1(effect.recipientRef)
                && hasMinLength1(effect.idempotencyKey)
                && isValidOnError(effect.onError);
        case 'evidenceRequest':
            return hasOnlyAllowedKeys(effect, REQUEST_REF_EFFECT_KEYS)
                && hasMinLength1(effect.requestRef)
                && hasMinLength1(effect.idempotencyKey)
                && isValidOnError(effect.onError);
        case 'serviceRequest':
            return hasOnlyAllowedKeys(effect, REQUEST_REF_EFFECT_KEYS)
                && typeof effect.requestRef === 'string'
                && RESPONSE_ACTION_ID_PATTERN.test(effect.requestRef)
                && hasMinLength1(effect.idempotencyKey)
                && isValidOnError(effect.onError);
        case 'hostEvent':
            return hasOnlyAllowedKeys(effect, HOST_EVENT_EFFECT_KEYS)
                && hasMinLength1(effect.eventName)
                && (effect.detailRef === undefined || typeof effect.detailRef === 'string');
        case 'browserResource':
            return hasOnlyAllowedKeys(effect, BROWSER_RESOURCE_EFFECT_KEYS)
                && (effect.operation === 'open' || effect.operation === 'download')
                && typeof effect.resourceRef === 'string'
                && BROWSER_RESOURCE_REF_PATTERN.test(effect.resourceRef)
                && (effect.target === undefined || effect.target === 'self' || effect.target === 'new')
                && isValidOnError(effect.onError);
        default:
            return false;
    }
}
function hasValidResponseActionShape(value) {
    const action = asRecord(value);
    if (!action
        || !hasOnlyAllowedKeys(action, ACTION_ALLOWED_KEYS)
        || typeof action.id !== 'string'
        || !RESPONSE_ACTION_ID_PATTERN.test(action.id)
        || !isValidResponseActionIntent(action.intent)
        || (action.actor !== undefined && typeof action.actor !== 'string')
        || (action['x-generation'] !== undefined && !isValidGeneration(action['x-generation']))
        || (action.preconditions !== undefined
            && !everyDenseElement(action.preconditions, isValidPrecondition))
        || (action.onFailure !== undefined && action.onFailure !== 'stop' && action.onFailure !== 'retry-once')
        || (action.onDeferred !== undefined && action.onDeferred !== 'stop' && action.onDeferred !== 'await')
        || !Array.isArray(action.effects)
        || action.effects.length === 0
        || !everyDenseElement(action.effects, hasValidResponseActionEffectShape)) {
        return false;
    }
    let validationRecord = null;
    const hasValidation = Object.prototype.hasOwnProperty.call(action, 'validation');
    if (hasValidation && action.validation !== undefined) {
        validationRecord = asRecord(action.validation);
        if (!validationRecord || !hasOnlyAllowedKeys(validationRecord, VALIDATION_OVERRIDE_KEYS)) {
            return false;
        }
    }
    const label = action.label;
    if (label !== undefined) {
        const candidate = asRecord(label);
        const keys = candidate ? Object.keys(candidate) : [];
        if (keys.length !== 1)
            return false;
        const onlyKey = keys[0];
        if ((onlyKey !== 'literal' && onlyKey !== 'ref') || !hasMinLength1(candidate[onlyKey])) {
            return false;
        }
    }
    try {
        const sanitizedAction = hasValidation
            ? Object.assign(Object.create(null), action, { validation: validationRecord ?? action.validation })
            : action;
        resolveResponseActionValidationTuple(sanitizedAction);
    }
    catch {
        return false;
    }
    return true;
}
function hasActionLabel(action) {
    const record = asRecord(action);
    const label = record ? asRecord(record.label) : null;
    return label ? hasNonEmptyString(label.literal) || hasNonEmptyString(label.ref) : false;
}
/**
 * Fail-closed schema-faithful validator for a Definition-scoped Response Actions
 * document (`schemas/response-actions.schema.json`). Shared by renderer
 * auto-placement, Surface slot-supply planning, and automatic `autosave`
 * selection so every consumer agrees on whether a document is valid.
 */
export function isValidDefinitionResponseActionsDocument(document, definition) {
    const candidate = asRecord(document);
    const target = asRecord(candidate?.targetDefinition);
    if (!candidate
        || !hasOnlyAllowedKeys(candidate, DOCUMENT_ALLOWED_KEYS, true)
        || candidate.$formspecResponseActions !== '1.0'
        || !hasMinLength1(candidate.version)
        || (candidate.name !== undefined && (typeof candidate.name !== 'string' || !DOCUMENT_NAME_PATTERN.test(candidate.name)))
        || (candidate.title !== undefined && typeof candidate.title !== 'string')
        || (candidate.description !== undefined && typeof candidate.description !== 'string')
        || (candidate.modules !== undefined && !everyDenseElement(candidate.modules, isValidModuleRef))
        || (candidate.scope !== undefined && candidate.scope !== 'response')
        || !target
        || !hasOnlyAllowedKeys(target, TARGET_DEFINITION_KEYS)
        || !isValidRfc3986Uri(target.url)
        || typeof definition?.url !== 'string'
        || (target.compatibleVersions !== undefined
            && !hasMinLength1(target.compatibleVersions))
        || !targetDefinitionMatches({
            url: target.url,
            ...(typeof target.compatibleVersions === 'string'
                ? { compatibleVersions: target.compatibleVersions }
                : {}),
        }, {
            url: definition.url,
            ...(typeof definition.version === 'string' && definition.version.length > 0
                ? { version: definition.version }
                : {}),
        })
        || (candidate['x-formspec-runtime'] !== undefined && !isValidRuntimeRequestCatalog(candidate['x-formspec-runtime']))
        || !Array.isArray(candidate.actions)
        || candidate.actions.length === 0
        || !everyDenseElement(candidate.actions, hasValidResponseActionShape)) {
        return false;
    }
    const ids = new Set();
    for (const action of candidate.actions) {
        if (ids.has(action.id))
            return false;
        ids.add(action.id);
    }
    return true;
}
/**
 * Whether a Response Action represents background/system-initiated behavior
 * (`intent === 'autosave'` per Validation Mapping §2) rather than a manual
 * respondent control. Renderers MUST NOT synthesize interactive ActionButtons
 * for background actions even when they carry a label.
 */
export function isBackgroundResponseAction(action) {
    return action?.intent === 'autosave';
}
/**
 * Select manual response-scoped Actions that a Definition auto-renderer can
 * place without inventing a control label. The document itself must be a
 * matching, response-scoped document with unique, structurally usable actions;
 * one bad action closes the whole auto-placement seam. Background intents
 * (`autosave`) are excluded from synthesized manual buttons.
 */
export function autoPlacedDefinitionActions(document, definition) {
    if (!isValidDefinitionResponseActionsDocument(document, definition)) {
        return [];
    }
    return document.actions.filter(action => !isBackgroundResponseAction(action) && hasActionLabel(action));
}
/**
 * Resolve the single unambiguous draft-checkpoint `autosave` Action for a
 * Definition from a complete, schema-valid response-scoped Response Actions
 * document. Because `actions[]` order is documentation-only, multiple eligible
 * `autosave` Actions fail closed and return an `ambiguous-autosave-action`
 * finding independent of array order.
 */
export function resolveAutosaveResponseAction(document, definition) {
    const candidate = asRecord(document);
    const target = asRecord(candidate?.targetDefinition);
    const expectedUrl = definition && hasNonEmptyString(definition.url)
        ? definition.url
        : target?.url;
    if (!hasNonEmptyString(expectedUrl)
        || !isValidDefinitionResponseActionsDocument(document, {
            url: expectedUrl,
            ...(definition && typeof definition.version === 'string' && definition.version.length > 0
                ? { version: definition.version }
                : {}),
        })) {
        return { action: null };
    }
    const eligible = [];
    for (const entry of document.actions) {
        if (entry.intent !== 'autosave')
            continue;
        const resolution = resolveResponseAction(document, entry.id);
        if (!resolution.resolved || !resolution.action)
            continue;
        try {
            if (resolveResponseActionValidationTuple(resolution.action).persistence !== 'draft-checkpoint') {
                continue;
            }
        }
        catch {
            continue;
        }
        eligible.push(resolution.action);
    }
    if (eligible.length === 0) {
        return { action: null };
    }
    if (eligible.length > 1) {
        const ambiguousActionIds = eligible.map((action) => action.id).sort();
        return {
            action: null,
            ambiguousActionIds,
            finding: {
                code: 'COMP-REFERENTIAL-INTEGRITY',
                severity: 'error',
                kind: 'actionRef',
                target: 'autosave',
                reason: 'ambiguous-autosave-action',
            },
        };
    }
    return { action: eligible[0] };
}
/**
 * Resolve the valid draft-checkpoint `autosave` Action for a Definition, if
 * exactly one is published unambiguously in a valid matching response-scoped document.
 */
export function findAutosaveResponseAction(document, definition) {
    return resolveAutosaveResponseAction(document, definition).action;
}
function captureEffectiveAutosavePolicy(document, action) {
    if (!action)
        return null;
    const runtime = document?.['x-formspec-runtime'];
    const requests = isPlainJsonObject(runtime) && Array.isArray(runtime.requests)
        ? runtime.requests
        : [];
    const seen = new Set();
    const referencedRequests = [];
    for (const effect of action.effects ?? []) {
        if (effect.type !== 'serviceRequest')
            continue;
        const ref = effect.requestRef;
        if (typeof ref !== 'string' || seen.has(ref))
            continue;
        seen.add(ref);
        const matches = requests
            .filter((candidate) => isPlainJsonObject(candidate) && candidate.id === ref)
            .map((candidate) => cloneValue(candidate));
        referencedRequests.push([ref, matches]);
    }
    return {
        action: cloneValue(action),
        referencedRequests,
    };
}
/**
 * Create a per-engine `autosave` controller that preserves unsaved dirty edits
 * across `responseActionsDocument` replacements (equivalent re-parsed objects,
 * ambiguity corrections `2 -> 1`, and ambiguity cancellations `1 -> 2`).
 */
export function createResponseActionAutosaveController(options) {
    const debounceMs = options.debounceMs ?? 400;
    const draftEditVersionSignal = getDraftEditVersionSignal(options.engine);
    let currentDocument = options.document;
    let resolvedAutosave = null;
    let resolvedPolicySnapshot = null;
    let lastFinding;
    // Conforming wrapper engines without the internal edit-version signal keep
    // a single baseline snapshot across inactive periods (no per-edit polling).
    let baselineSnapshot = draftEditVersionSignal ? undefined : options.engine.getDraftSnapshot();
    let edit = 0;
    let savedEdit = 0;
    let timer;
    let inFlight;
    let pendingFlushAfterInFlight = false;
    let active = true;
    let generation = 0;
    let unsubscribe;
    function clearTimer() {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    }
    function detachSubscription() {
        unsubscribe?.();
        unsubscribe = undefined;
    }
    function schedule() {
        if (!active || !resolvedAutosave || edit === savedEdit)
            return;
        pendingFlushAfterInFlight = false;
        clearTimer();
        timer = setTimeout(() => {
            timer = undefined;
            void run();
        }, debounceMs);
    }
    function syncSubscription(shouldTrackFallback) {
        if (!active)
            return;
        if (draftEditVersionSignal) {
            if (unsubscribe)
                return;
            let lastVersion;
            unsubscribe = preactReactiveRuntime.effect(() => {
                const currentVersion = draftEditVersionSignal.value;
                if (lastVersion === undefined) {
                    lastVersion = currentVersion;
                    return;
                }
                if (currentVersion !== lastVersion) {
                    lastVersion = currentVersion;
                    edit += 1;
                    options.onEdit?.();
                    schedule();
                }
            });
            return;
        }
        if (!shouldTrackFallback) {
            detachSubscription();
            return;
        }
        const latest = options.engine.getDraftSnapshot();
        if (!deepEqual(latest, baselineSnapshot)) {
            baselineSnapshot = latest;
            edit += 1;
            options.onEdit?.();
        }
        if (unsubscribe)
            return;
        let initialized = false;
        unsubscribe = preactReactiveRuntime.effect(() => {
            options.engine.getEvaluatedFormState({ profile: 'off' });
            if (!initialized) {
                initialized = true;
                return;
            }
            const current = options.engine.getDraftSnapshot();
            if (!deepEqual(current, baselineSnapshot)) {
                baselineSnapshot = current;
                edit += 1;
                options.onEdit?.();
                schedule();
            }
        });
    }
    function run() {
        if (!active || !resolvedAutosave || edit === savedEdit)
            return Promise.resolve();
        if (inFlight) {
            pendingFlushAfterInFlight = true;
            return inFlight;
        }
        const actionToRun = resolvedAutosave;
        const documentToRun = currentDocument;
        const runGeneration = generation;
        const targetEdit = edit;
        const currentRun = Promise.resolve()
            .then(() => options.invoke(actionToRun, {
            document: documentToRun,
            isCurrent: () => active && generation === runGeneration,
        }))
            .then((outcome) => {
            if (!active)
                return;
            const status = outcome && typeof outcome === 'object' && 'status' in outcome
                ? outcome.status
                : undefined;
            if (status !== 'failed' && status !== 'blocked' && status !== 'unresolved') {
                savedEdit = Math.max(savedEdit, targetEdit);
            }
        })
            .catch(() => {
            // Caller owns error reporting; never leak an unhandled timer rejection.
        })
            .finally(() => {
            inFlight = undefined;
            if (active
                && resolvedAutosave !== null
                && pendingFlushAfterInFlight
                && timer === undefined
                && edit !== savedEdit) {
                pendingFlushAfterInFlight = false;
                void run();
            }
        });
        inFlight = currentRun;
        return currentRun;
    }
    function reconcileDocument(nextDocument, initial) {
        if (!active)
            return;
        const previousPolicy = resolvedPolicySnapshot;
        const previousAction = previousPolicy?.action ?? null;
        const previousFinding = lastFinding;
        currentDocument = nextDocument;
        const resolution = resolveAutosaveResponseAction(currentDocument, options.engine.getDefinition?.());
        const nextAction = resolution.action;
        const nextPolicy = captureEffectiveAutosavePolicy(currentDocument, nextAction);
        const equivalentAction = previousPolicy !== null
            && nextPolicy !== null
            && deepEqual(previousPolicy, nextPolicy);
        const unchangedPolicy = !initial && (equivalentAction
            || (previousPolicy === null
                && nextPolicy === null
                && deepEqual(previousFinding, resolution.finding)));
        resolvedAutosave = nextAction;
        resolvedPolicySnapshot = nextPolicy;
        lastFinding = resolution.finding ? cloneValue(resolution.finding) : undefined;
        if (unchangedPolicy) {
            return;
        }
        if (!initial) {
            generation += 1;
            options.onDocumentChange?.({
                previousAction,
                nextAction,
                equivalentAction,
            });
        }
        if (resolution.finding) {
            options.onFinding?.(resolution.finding);
        }
        syncSubscription(resolvedAutosave !== null);
        if (!resolvedAutosave) {
            clearTimer();
            pendingFlushAfterInFlight = false;
            return;
        }
        if (edit !== savedEdit) {
            if (inFlight) {
                pendingFlushAfterInFlight = true;
            }
            else if (timer === undefined) {
                schedule();
            }
        }
    }
    reconcileDocument(options.document, true);
    return {
        setDocument(nextDocument) {
            reconcileDocument(nextDocument, false);
        },
        dispose() {
            active = false;
            generation += 1;
            pendingFlushAfterInFlight = false;
            clearTimer();
            detachSubscription();
        },
    };
}
/**
 * Subscribe to `FormEngine` draft changes after mount and invoke the declared
 * `autosave` Response Action with debounce (`400ms` default) and single-flight
 * coalescing. Returns a cleanup function that cancels pending timers and
 * detaches the reactive subscription.
 */
export function subscribeResponseActionAutosave(options) {
    const controller = createResponseActionAutosaveController(options);
    return () => controller.dispose();
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
function effectErrorPolicy(effect) {
    if ('onError' in effect && (effect.onError === 'fail' || effect.onError === 'defer')) {
        return effect.onError;
    }
    return effect.type === 'evidenceRequest' ? 'defer' : 'fail';
}
function safeTransitionBindings(value) {
    if (value === undefined)
        return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('effect transitionBindings must be an object');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('effect transitionBindings must be a plain object');
    }
    const bindings = Object.create(null);
    for (const name of Object.keys(value)) {
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
            throw new Error(`effect transition binding ${JSON.stringify(name)} has an unsafe name`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new Error(`effect transition binding ${JSON.stringify(name)} is not an own data property`);
        }
        if (typeof descriptor.value !== 'string' || descriptor.value.length === 0) {
            throw new Error(`effect transition binding ${JSON.stringify(name)} must be a non-empty string`);
        }
        bindings[name] = descriptor.value;
    }
    return Object.freeze(bindings);
}
function normalizeEffectDispatch(effect, value, idempotencyKey) {
    const fallback = { type: effect.type };
    if (!value) {
        return {
            outcome: {
                ...fallback,
                status: 'succeeded',
                ...(idempotencyKey ? { idempotencyKey } : {}),
            },
        };
    }
    const wrapped = Object.prototype.hasOwnProperty.call(value, 'outcome');
    const outcome = wrapped
        ? value.outcome
        : value;
    if (!outcome || typeof outcome !== 'object') {
        throw new Error('effect dispatcher returned no outcome');
    }
    if (!['succeeded', 'failed', 'deferred', 'replayed', 'not-invoked'].includes(outcome.status)) {
        throw new Error('effect dispatcher returned an unsupported outcome status');
    }
    for (const member of ['outcomeRef', 'reason', 'replayToken']) {
        if (outcome[member] !== undefined && typeof outcome[member] !== 'string') {
            throw new Error(`effect dispatcher outcome ${member} must be a string`);
        }
    }
    return {
        outcome: {
            ...fallback,
            status: outcome.status,
            ...(idempotencyKey ? { idempotencyKey } : {}),
            ...(outcome.outcomeRef !== undefined ? { outcomeRef: outcome.outcomeRef } : {}),
            ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
            ...(outcome.replayToken !== undefined ? { replayToken: outcome.replayToken } : {}),
        },
        ...(wrapped
            ? {
                transitionBindings: safeTransitionBindings(value.transitionBindings),
            }
            : {}),
    };
}
function mergeTransitionBindings(target, source) {
    if (!source)
        return;
    for (const name of Object.keys(source)) {
        if (Object.prototype.hasOwnProperty.call(target, name)) {
            throw new Error(`duplicate transition binding ${JSON.stringify(name)}`);
        }
    }
    for (const [name, value] of Object.entries(source)) {
        target[name] = value;
    }
}
function isPromiseLike(value) {
    return value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof value.then === 'function';
}
function effectWithIdempotencyKey(effect, idempotencyKey) {
    if (!idempotencyKey || !isDurableResponseActionEffect(effect)) {
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
function notInvokedEffectTrace(effects, startIndex, reason) {
    return effects.slice(startIndex).map((effect) => ({
        type: effect.type,
        status: 'not-invoked',
        reason,
    }));
}
function invokeResponseActionInternal(document, actionRef, ports, nodeId, invocationContext, asyncEffects = false) {
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
    const effects = resolution.action.effects ?? [];
    const invocationFacts = {
        invocationId,
        ...(invocationContext?.actionArtifact
            ? {
                actionOwner: {
                    ...invocationContext.actionArtifact,
                    subjectKind: 'response-action',
                    subjectRef: actionId,
                },
            }
            : {}),
    };
    const appScoped = document?.scope === 'app';
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
    if (appScoped && !isAppActionValidationTuple(validationTuple)) {
        return {
            status: 'failed',
            ...invocationFacts,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedEffectTrace(effects, 0, 'action scope rejected before effects'),
            failureReason: 'app actions require validation=(off, non-blocking, none)',
        };
    }
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
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(effects, 0, 'precondition resolution failed before effects'),
                failedPreconditionId: precondition.id,
                failureReason: `unbound context reference: @${catalogCheck.unbound.join(', @')}`,
            };
        }
        if (!ports.evaluatePrecondition) {
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(effects, 0, 'precondition evaluation unavailable before effects'),
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
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(effects, 0, 'precondition evaluation failed before effects'),
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
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(effects, 0, 'action deferred by precondition'),
                deferredPreconditionId: precondition.id,
                failureReason: preconditionReason(preconditionResult),
            };
        }
        return {
            status: 'blocked',
            ...invocationFacts,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedEffectTrace(effects, 0, 'action blocked by precondition'),
            blockedCause: 'precondition',
            blockedPreconditionId: precondition.id,
            failureReason: preconditionReason(preconditionResult),
        };
    }
    const detail = appScoped
        ? ports.prepareAppAction?.(resolution.action) ?? null
        : ports.submit?.({
            profile: validationTuple.profile,
            validationTuple,
            emitEvent: false,
        }) ?? null;
    if (!detail) {
        return {
            status: 'failed',
            ...invocationFacts,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedEffectTrace(effects, 0, 'action input unavailable before effects'),
            failureReason: appScoped
                ? 'app action adapter returned no detail'
                : 'submit adapter returned no detail',
        };
    }
    if (!appScoped) {
        const validationValid = inferValidationReportValid(detail, ports);
        if (validationTuple.profile !== 'off' && validationValid === null) {
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: notInvokedEffectTrace(effects, 0, 'validation evidence unavailable before effects'),
                failureReason: 'validation report missing valid flag',
            };
        }
        if (validationTuple.blocking === 'block-on-error' && validationValid === false) {
            return {
                status: 'blocked',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: notInvokedEffectTrace(effects, 0, 'action blocked by validation'),
                blockedCause: 'validation',
            };
        }
    }
    if (asyncEffects) {
        return invokeResponseActionEffectsAsync(resolution.action, resolution, validationTuple, detail, invocationFacts, ports, emitLifecycle);
    }
    const effectTrace = [];
    const resolveHostEventDetail = hostEventDetailResolver(detail, resolution.action, ports, invocationId);
    const transitionBindings = Object.create(null);
    const frozenIdempotencyKeys = new Map();
    const retriedEffects = new Set();
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        let attempt = 0;
        while (true) {
            let idempotencyKey;
            let effectForDispatch = effect;
            let outcome;
            let retryableFailure = true;
            try {
                if (isDurableResponseActionEffect(effect)) {
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
                    ports.dispatchHostEvent(effect.eventName, resolveHostEventDetail(effect, effectIndex, attempt, effectTrace), resolution.action);
                    outcome = normalizeEffectDispatch(effect, undefined).outcome;
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
                    const dispatchValue = ports.dispatchEffect(effectForDispatch, detail, resolution.action, {
                        effectIndex,
                        attempt,
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    });
                    if (isPromiseLike(dispatchValue)) {
                        retryableFailure = false;
                        void Promise.resolve(dispatchValue).catch(() => undefined);
                        throw new Error('async effect dispatcher returned a Promise; use invokeResponseActionAsync');
                    }
                    let normalized;
                    try {
                        normalized = normalizeEffectDispatch(effect, dispatchValue, idempotencyKey);
                        if (normalized.outcome.status === 'succeeded'
                            || normalized.outcome.status === 'replayed') {
                            mergeTransitionBindings(transitionBindings, normalized.transitionBindings);
                        }
                    }
                    catch (error) {
                        retryableFailure = false;
                        throw error;
                    }
                    outcome = normalized.outcome;
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
            // One owner-produced record per declared effect. A retry replaces
            // that effect's prior failed attempt; dispatch context and
            // lifecycle events retain attempt detail without corrupting the
            // declaration-order trace.
            effectTrace[effectIndex] = outcome;
            if (outcome.status === 'succeeded' || outcome.status === 'replayed') {
                break;
            }
            const deferred = outcome.status === 'deferred'
                || (retryableFailure && effectErrorPolicy(effect) === 'defer');
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
                    ...invocationFacts,
                    resolution,
                    validationTuple,
                    detail,
                    effectTrace: [
                        ...effectTrace,
                        ...notInvokedEffectTrace(effects, effectIndex + 1, `action deferred at effect ${effectIndex}`),
                    ],
                    deferredEffectIndex: effectIndex,
                    replayToken: outcome.replayToken,
                    failureReason: outcome.reason,
                };
            }
            if (retryableFailure
                && resolution.action.onFailure === 'retry-once'
                && !retriedEffects.has(effectIndex)) {
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
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: [
                    ...effectTrace,
                    ...notInvokedEffectTrace(effects, effectIndex + 1, `action failed at effect ${effectIndex}`),
                ],
                failedEffectIndex: effectIndex,
                failureReason: outcome.reason,
            };
        }
    }
    return {
        status: 'completed',
        ...invocationFacts,
        resolution,
        validationTuple,
        detail,
        effectTrace,
        ...(Object.keys(transitionBindings).length > 0
            ? { transitionBindings: Object.freeze(transitionBindings) }
            : {}),
    };
}
async function invokeResponseActionEffectsAsync(action, resolution, validationTuple, detail, invocationFacts, ports, emitLifecycle) {
    const effects = action.effects ?? [];
    const effectTrace = [];
    const resolveHostEventDetail = hostEventDetailResolver(detail, action, ports, invocationFacts.invocationId);
    const transitionBindings = Object.create(null);
    const frozenIdempotencyKeys = new Map();
    const retriedEffects = new Set();
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        let attempt = 0;
        while (true) {
            let idempotencyKey;
            let effectForDispatch = effect;
            let outcome;
            let retryableFailure = true;
            try {
                if (isDurableResponseActionEffect(effect)) {
                    idempotencyKey = frozenIdempotencyKeys.get(effectIndex);
                    if (!idempotencyKey) {
                        maybeWarnAboutStaticIdempotencyKey(action.id, effectIndex, effect.idempotencyKey);
                        if (!ports.resolveIdempotencyKey) {
                            throw new Error('missing idempotency key resolver');
                        }
                        idempotencyKey = ports.resolveIdempotencyKey(effect, action, { effectIndex });
                        if (!idempotencyKey) {
                            throw new Error('idempotency key resolver returned an empty key');
                        }
                        frozenIdempotencyKeys.set(effectIndex, idempotencyKey);
                    }
                    effectForDispatch = effectWithIdempotencyKey(effect, idempotencyKey);
                }
                if (effect.type === 'hostEvent' && typeof effect.eventName === 'string') {
                    ports.dispatchHostEvent(effect.eventName, resolveHostEventDetail(effect, effectIndex, attempt, effectTrace), action);
                    outcome = normalizeEffectDispatch(effect, undefined).outcome;
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
                    const dispatchValue = await ports.dispatchEffect(effectForDispatch, detail, action, {
                        effectIndex,
                        attempt,
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    });
                    let normalized;
                    try {
                        normalized = normalizeEffectDispatch(effect, dispatchValue, idempotencyKey);
                        if (normalized.outcome.status === 'succeeded'
                            || normalized.outcome.status === 'replayed') {
                            mergeTransitionBindings(transitionBindings, normalized.transitionBindings);
                        }
                    }
                    catch (error) {
                        retryableFailure = false;
                        throw error;
                    }
                    outcome = normalized.outcome;
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
            effectTrace[effectIndex] = outcome;
            if (outcome.status === 'succeeded' || outcome.status === 'replayed')
                break;
            const deferred = outcome.status === 'deferred'
                || (retryableFailure && effectErrorPolicy(effect) === 'defer');
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
                    ...invocationFacts,
                    resolution,
                    validationTuple,
                    detail,
                    effectTrace: [
                        ...effectTrace,
                        ...notInvokedEffectTrace(effects, effectIndex + 1, `action deferred at effect ${effectIndex}`),
                    ],
                    deferredEffectIndex: effectIndex,
                    replayToken: outcome.replayToken,
                    failureReason: outcome.reason,
                };
            }
            if (retryableFailure
                && action.onFailure === 'retry-once'
                && !retriedEffects.has(effectIndex)) {
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
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: [
                    ...effectTrace,
                    ...notInvokedEffectTrace(effects, effectIndex + 1, `action failed at effect ${effectIndex}`),
                ],
                failedEffectIndex: effectIndex,
                failureReason: outcome.reason,
            };
        }
    }
    return {
        status: 'completed',
        ...invocationFacts,
        resolution,
        validationTuple,
        detail,
        effectTrace,
        ...(Object.keys(transitionBindings).length > 0
            ? { transitionBindings: Object.freeze(transitionBindings) }
            : {}),
    };
}
/** Invoke an Action with synchronous effect adapters. Promise outcomes fail fast. */
export function invokeResponseAction(document, actionRef, ports, nodeId, invocationContext) {
    return invokeResponseActionInternal(document, actionRef, ports, nodeId, invocationContext, false);
}
/** Invoke an Action while awaiting effect adapters in strict declaration order. */
export async function invokeResponseActionAsync(document, actionRef, ports, nodeId, invocationContext) {
    return await invokeResponseActionInternal(document, actionRef, ports, nodeId, invocationContext, true);
}
