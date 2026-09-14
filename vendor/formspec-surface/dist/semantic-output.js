/**
 * @filedesc Renderer-owned, portable semantic output observations.
 *
 * This registry contains only facts committed by a mounted renderer. It never
 * queries a DOM, infers a node from visible copy, or manufactures
 * `rendered: false` from absence.
 */
const utf8Encoder = new TextEncoder();
function nonEmpty(value) {
    return value.length > 0 && value.trim() === value;
}
function assertArtifactIdentity(artifact) {
    if (!nonEmpty(artifact.artifactRef) || !nonEmpty(artifact.artifactDigest)) {
        throw new TypeError('semantic output artifact identity fields must be non-empty');
    }
}
function assertSubjectPrefix(subjectPrefix) {
    if (!nonEmpty(subjectPrefix)
        || subjectPrefix.startsWith('/')
        || subjectPrefix.endsWith('/')
        || subjectPrefix.split('/').length < 2
        || subjectPrefix.split('/').some((segment) => !nonEmpty(segment))) {
        throw new TypeError('semantic output subjectPrefix must contain an exact route/slot path');
    }
}
function exactKey(target) {
    return JSON.stringify([
        target.renderInstanceId,
        target.node.artifactRef,
        target.node.artifactDigest,
        target.node.subjectKind,
        target.node.subjectRef,
    ]);
}
function scopeKey(scope) {
    return JSON.stringify([
        scope.renderInstanceId,
        scope.surfaceArtifact.artifactRef,
        scope.surfaceArtifact.artifactDigest,
    ]);
}
function compareUnsignedBytes(left, right) {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference !== 0)
            return difference;
    }
    return left.length - right.length;
}
function compareSubjectRefs(left, right) {
    return compareUnsignedBytes(utf8Encoder.encode(left.node.subjectRef), utf8Encoder.encode(right.node.subjectRef));
}
function targetFor(scope, subjectRef) {
    return {
        renderInstanceId: scope.renderInstanceId,
        node: {
            ...scope.surfaceArtifact,
            subjectKind: 'surface-node',
            subjectRef,
        },
    };
}
function cloneSemanticValue(value, ancestors) {
    if (value === null
        || typeof value === 'string'
        || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('semantic output values must contain only finite numbers');
        }
        return value;
    }
    if (typeof value !== 'object') {
        throw new TypeError('semantic output values must be finite JSON');
    }
    if (ancestors.has(value)) {
        throw new TypeError('semantic output values must not contain cycles');
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const copy = value.map((item, index) => {
                if (!Object.prototype.hasOwnProperty.call(value, index)) {
                    throw new TypeError('semantic output arrays must not be sparse');
                }
                return cloneSemanticValue(item, ancestors);
            });
            return Object.freeze(copy);
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError('semantic output objects must be plain JSON objects');
        }
        const keys = Object.keys(value);
        if (Reflect.ownKeys(value).length !== keys.length) {
            throw new TypeError('semantic output objects must contain enumerable string keys only');
        }
        const copy = {};
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                throw new TypeError('semantic output objects must not contain accessors');
            }
            copy[key] = cloneSemanticValue(descriptor.value, ancestors);
        }
        return Object.freeze(copy);
    }
    finally {
        ancestors.delete(value);
    }
}
function normalizeOutput(scope, declaration) {
    if (!nonEmpty(declaration.subjectRef)) {
        throw new TypeError('semantic output subjectRef must be non-empty');
    }
    if (declaration.subjectRef !== scope.subjectPrefix
        && !declaration.subjectRef.startsWith(`${scope.subjectPrefix}/`)) {
        throw new TypeError('semantic output subjectRef is outside the publisher subjectPrefix');
    }
    const semanticValue = Object.prototype.hasOwnProperty.call(declaration, 'semanticValue')
        ? cloneSemanticValue(declaration.semanticValue, new Set())
        : undefined;
    return Object.freeze({
        ...targetFor(scope, declaration.subjectRef),
        rendered: true,
        ...(declaration.operable === undefined
            ? {}
            : { operable: declaration.operable }),
        ...(semanticValue === undefined ? {} : { semanticValue }),
    });
}
function cloneTarget(target) {
    return Object.freeze({
        renderInstanceId: target.renderInstanceId,
        node: Object.freeze({ ...target.node }),
    });
}
/**
 * Creates one output aggregation domain for a host or outcome runner.
 *
 * The registry deliberately has no history-based `rendered: false` state.
 * Once the last publisher disposes an output, an exact lookup is `missing`.
 */
export function createSurfaceSemanticOutputRegistry() {
    let publisherSequence = 0;
    const active = new Map();
    const publisherKeys = new Map();
    const removePublisher = (publisherId) => {
        for (const key of publisherKeys.get(publisherId) ?? []) {
            const remaining = (active.get(key) ?? []).filter((entry) => entry.publisherId !== publisherId);
            if (remaining.length === 0)
                active.delete(key);
            else
                active.set(key, remaining);
        }
        publisherKeys.delete(publisherId);
    };
    const lookup = (target) => {
        const exact = active.get(exactKey(target)) ?? [];
        if (exact.length === 0) {
            return { status: 'missing', target: cloneTarget(target) };
        }
        if (exact.length > 1) {
            return {
                status: 'ambiguous',
                target: cloneTarget(target),
                publisherCount: exact.length,
            };
        }
        return { status: 'resolved', output: exact[0].output };
    };
    return {
        mount(scope) {
            assertArtifactIdentity(scope.surfaceArtifact);
            if (!nonEmpty(scope.renderInstanceId)) {
                throw new TypeError('semantic output renderInstanceId must be non-empty');
            }
            assertSubjectPrefix(scope.subjectPrefix);
            const frozenScope = Object.freeze({
                surfaceArtifact: Object.freeze({ ...scope.surfaceArtifact }),
                renderInstanceId: scope.renderInstanceId,
                subjectPrefix: scope.subjectPrefix,
            });
            publisherSequence += 1;
            const publisherId = publisherSequence;
            let mounted = true;
            return {
                replace(declarations) {
                    if (!mounted) {
                        throw new Error('cannot replace outputs on a disposed semantic output mount');
                    }
                    let normalized;
                    try {
                        normalized = declarations.map((declaration) => normalizeOutput(frozenScope, declaration));
                        if (new Set(normalized.map((output) => output.node.subjectRef)).size
                            !== normalized.length) {
                            throw new TypeError('one semantic output publisher must not declare a subjectRef more than once');
                        }
                    }
                    catch (error) {
                        removePublisher(publisherId);
                        throw error;
                    }
                    removePublisher(publisherId);
                    const keys = [];
                    for (const output of normalized) {
                        const key = exactKey(output);
                        keys.push(key);
                        active.set(key, [
                            ...(active.get(key) ?? []),
                            { publisherId, output },
                        ]);
                    }
                    publisherKeys.set(publisherId, keys);
                },
                dispose() {
                    if (!mounted)
                        return;
                    mounted = false;
                    removePublisher(publisherId);
                },
            };
        },
        lookup,
        snapshot(scope) {
            assertArtifactIdentity(scope.surfaceArtifact);
            if (!nonEmpty(scope.renderInstanceId)) {
                throw new TypeError('semantic output renderInstanceId must be non-empty');
            }
            const prefix = scopeKey(scope);
            const targets = [...active.values()]
                .flatMap((entries) => entries[0]?.output ?? [])
                .filter((output) => scopeKey({
                surfaceArtifact: output.node,
                renderInstanceId: output.renderInstanceId,
            }) === prefix)
                .map((output) => ({
                renderInstanceId: output.renderInstanceId,
                node: output.node,
            }))
                .sort(compareSubjectRefs);
            return targets.map((target) => {
                const result = lookup(target);
                if (result.status === 'missing') {
                    throw new Error('semantic output registry changed during a synchronous snapshot');
                }
                return result;
            });
        },
    };
}
