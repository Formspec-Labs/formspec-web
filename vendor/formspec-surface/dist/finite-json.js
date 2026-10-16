/** @filedesc Detached finite JSON snapshots and deterministic private replay identity. */
const MAX_RESPONSE_DATA_DEPTH = 128;
const MAX_RESPONSE_DATA_NODES = 100_000;
const snapshotRefusals = new WeakMap();
/** A snapshot refusal remains a TypeError with its original message and name. */
export class FiniteJsonSnapshotError extends TypeError {
    constructor(reason, message) {
        super(message);
        if (reason !== "node-limit" && reason !== "depth-limit"
            && reason !== "non-finite-number" && reason !== "invalid-json-shape") {
            throw new TypeError("Invalid finite JSON snapshot refusal reason");
        }
        Object.defineProperty(this, "reason", { value: reason, enumerable: false });
        snapshotRefusals.set(this, reason);
    }
}
/** Classify only owning helper errors; do not inspect arbitrary error properties. */
export function finiteJsonSnapshotRefusalReason(error) {
    return typeof error === "object" && error !== null ? snapshotRefusals.get(error) : undefined;
}
function cloneFiniteJson(value, active, state, depth, immutable) {
    state.nodes += 1;
    if (state.nodes > state.maxNodes ||
        depth > MAX_RESPONSE_DATA_DEPTH) {
        throw new FiniteJsonSnapshotError(state.nodes > state.maxNodes ? "node-limit" : "depth-limit", "Response data exceeds the safe snapshot limit");
    }
    if (value === null ||
        typeof value === "string" ||
        typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new FiniteJsonSnapshotError("non-finite-number", "Response data contains a non-finite number");
        }
        return value;
    }
    if (typeof value !== "object") {
        throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains a non-JSON value");
    }
    if (active.has(value)) {
        throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains a cycle");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype &&
        prototype !== Array.prototype &&
        prototype !== null) {
        throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains a non-JSON object");
    }
    active.add(value);
    try {
        if (Array.isArray(value)) {
            const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
            if (!lengthDescriptor ||
                !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
                typeof lengthDescriptor.value !== "number") {
                throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains an invalid array length");
            }
            const arrayLength = lengthDescriptor.value;
            // Every entry consumes at least one node. Refuse impossible arrays before
            // allocating keys or descriptors, even when their shape is also invalid.
            if (arrayLength > state.maxNodes - state.nodes) {
                throw new FiniteJsonSnapshotError("node-limit", "Response data exceeds the safe snapshot limit");
            }
            const ownKeys = Reflect.ownKeys(value);
            for (const key of ownKeys) {
                if (typeof key !== "string") {
                    throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains a symbol-keyed property");
                }
                if (key === "length")
                    continue;
                if (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= arrayLength) {
                    throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains a non-JSON array property");
                }
            }
            const copy = [];
            for (let index = 0; index < arrayLength; index += 1) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
                if (!descriptor ||
                    !descriptor.enumerable ||
                    !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                    throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains a sparse or accessor array");
                }
                copy.push(cloneFiniteJson(descriptor.value, active, state, depth + 1, immutable));
            }
            return immutable ? Object.freeze(copy) : copy;
        }
        const keys = Object.keys(value);
        if (Reflect.ownKeys(value).length !== keys.length) {
            throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data objects must contain enumerable string keys only");
        }
        const copy = Object.getPrototypeOf(value) === null
            ? Object.create(null)
            : {};
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor ||
                !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                throw new FiniteJsonSnapshotError("invalid-json-shape", "Response data contains an accessor property");
            }
            const child = cloneFiniteJson(descriptor.value, active, state, depth + 1, immutable);
            Object.defineProperty(copy, key, {
                value: child,
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        return immutable ? Object.freeze(copy) : copy;
    }
    finally {
        active.delete(value);
    }
}
export function canonicalFiniteJson(value) {
    if (value === null || typeof value !== "object") {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) {
            throw new FiniteJsonSnapshotError("invalid-json-shape", "Response snapshot cannot be canonicalized");
        }
        return serialized;
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalFiniteJson).join(",")}]`;
    }
    const record = value;
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalFiniteJson(record[key])}`)
        .join(",")}}`;
}
/**
 * Preserve JSON data and reject accessors without invoking them. Not schema validation.
 * Explicit policies change only traversal capacity; callers must budget complete
 * records and aggregates independently. Depth and JSON-shape guards remain fixed.
 */
export function snapshotFiniteJson(value, immutable = true, policy) {
    const maxNodes = policy === undefined ? MAX_RESPONSE_DATA_NODES : policy?.maxNodes;
    if (typeof maxNodes !== "number" || !Number.isSafeInteger(maxNodes) || maxNodes < 1) {
        throw new TypeError("Finite JSON snapshot maxNodes must be a positive safe integer");
    }
    return cloneFiniteJson(value, new WeakSet(), { nodes: 0, maxNodes }, 0, immutable);
}
