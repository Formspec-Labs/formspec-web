function isDraftDefinitionResponseSource(source) {
    return source.runtime.delivery === "draft";
}
const utf8Encoder = new TextEncoder();
const RFC_3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|([+-])(\d{2}):(\d{2}))$/u;
const MAX_RESPONSE_DATA_DEPTH = 128;
const MAX_RESPONSE_DATA_NODES = 100_000;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isDefinitionResponseSource(source) {
    if (source.kind !== "definition-response" ||
        typeof source.definitionRef !== "string" ||
        source.definitionRef.length === 0) {
        return false;
    }
    if (source.runtime.delivery === "draft") {
        return (source.runtime.cache.mode === "draft" &&
            !("responseSelection" in source));
    }
    if (source.runtime.delivery !== "snapshot" &&
        source.runtime.delivery !== "live") {
        return false;
    }
    const candidate = source;
    const selection = candidate.responseSelection;
    return (typeof candidate.definitionVersion === "string" &&
        candidate.definitionVersion.length > 0 &&
        isRecord(selection) &&
        selection.status === "completed" &&
        selection.cardinality === "latest" &&
        selection.orderBy === "authored-desc" &&
        selection.tieBreak === "response-id-asc" &&
        selection.partitionBy === "definition");
}
function daysInMonth(year, month) {
    if (month === 2) {
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return leap ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
/** Proleptic-Gregorian days since 1970-01-01. */
function daysFromCivil(year, month, day) {
    const adjustedYear = year - (month <= 2 ? 1 : 0);
    const era = Math.floor(adjustedYear / 400);
    const yearOfEra = adjustedYear - era * 400;
    const adjustedMonth = month + (month > 2 ? -3 : 9);
    const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
    const dayOfEra = yearOfEra * 365 +
        Math.floor(yearOfEra / 4) -
        Math.floor(yearOfEra / 100) +
        dayOfYear;
    return era * 146_097 + dayOfEra - 719_468;
}
/**
 * Parse the RFC 3339 shape the store can order as a real instant.
 *
 * `-00:00` is syntactically RFC 3339 but means that the local offset is
 * unknown. It cannot identify an instant for authored ordering, so this
 * selection boundary refuses it.
 */
function parseRfc3339Instant(value) {
    const match = RFC_3339_PATTERN.exec(value);
    if (!match)
        return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const fraction = (match[7] ?? "").replace(/0+$/u, "");
    const offsetToken = match[8];
    const offsetSign = match[9];
    const offsetHour = offsetToken && !/^[Zz]$/u.test(offsetToken) ? Number(match[10]) : 0;
    const offsetMinute = offsetToken && !/^[Zz]$/u.test(offsetToken) ? Number(match[11]) : 0;
    if (!Number.isInteger(year) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth(year, month) ||
        hour > 23 ||
        minute > 59 ||
        second > 60 ||
        offsetHour > 23 ||
        offsetMinute > 59 ||
        offsetToken === "-00:00") {
        return undefined;
    }
    const offsetDirection = offsetSign === "-" ? -1 : 1;
    const offsetSeconds = /^[Zz]$/u.test(offsetToken ?? "")
        ? 0
        : offsetDirection * (offsetHour * 60 + offsetMinute) * 60;
    const secondBeforeLeap = Math.min(second, 59);
    const localSecond = BigInt(daysFromCivil(year, month, day)) * 86400n +
        BigInt(hour * 3_600 + minute * 60 + secondBeforeLeap);
    const epochSecond = localSecond - BigInt(offsetSeconds);
    const leapSecond = second === 60;
    if (leapSecond) {
        // RFC 3339 permits `:60` only for an inserted leap second. Validate the
        // equivalent UTC preceding second, including offset representations.
        const preceding = new Date(Number(epochSecond) * 1_000);
        const isLeapBoundary = preceding.getUTCHours() === 23 &&
            preceding.getUTCMinutes() === 59 &&
            preceding.getUTCSeconds() === 59 &&
            ((preceding.getUTCMonth() === 5 && preceding.getUTCDate() === 30) ||
                (preceding.getUTCMonth() === 11 && preceding.getUTCDate() === 31));
        if (!isLeapBoundary)
            return undefined;
    }
    return { epochSecond, leapSecond, fraction };
}
function compareFraction(left, right) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const difference = (left.charCodeAt(index) || 48) - (right.charCodeAt(index) || 48);
        if (difference !== 0)
            return difference;
    }
    return 0;
}
function compareRfc3339Instants(left, right) {
    if (left.epochSecond < right.epochSecond)
        return -1;
    if (left.epochSecond > right.epochSecond)
        return 1;
    if (left.leapSecond !== right.leapSecond) {
        return left.leapSecond ? 1 : -1;
    }
    return compareFraction(left.fraction, right.fraction);
}
function cloneFiniteJson(value, active, state, depth, immutable) {
    state.nodes += 1;
    if (state.nodes > MAX_RESPONSE_DATA_NODES ||
        depth > MAX_RESPONSE_DATA_DEPTH) {
        throw new TypeError("Response data exceeds the safe snapshot limit");
    }
    if (value === null ||
        typeof value === "string" ||
        typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new TypeError("Response data contains a non-finite number");
        }
        return value;
    }
    if (typeof value !== "object") {
        throw new TypeError("Response data contains a non-JSON value");
    }
    if (active.has(value)) {
        throw new TypeError("Response data contains a cycle");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype &&
        prototype !== Array.prototype &&
        prototype !== null) {
        throw new TypeError("Response data contains a non-JSON object");
    }
    active.add(value);
    try {
        if (Array.isArray(value)) {
            const descriptors = Object.getOwnPropertyDescriptors(value);
            const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
            if (!lengthDescriptor ||
                !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
                typeof lengthDescriptor.value !== "number") {
                throw new TypeError("Response data contains an invalid array length");
            }
            const arrayLength = lengthDescriptor.value;
            const ownKeys = Reflect.ownKeys(descriptors);
            for (const key of ownKeys) {
                if (typeof key !== "string") {
                    throw new TypeError("Response data contains a symbol-keyed property");
                }
                if (key === "length")
                    continue;
                if (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= arrayLength) {
                    throw new TypeError("Response data contains a non-JSON array property");
                }
            }
            const copy = [];
            for (let index = 0; index < arrayLength; index += 1) {
                const descriptor = descriptors[String(index)];
                if (!descriptor ||
                    !descriptor.enumerable ||
                    !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                    throw new TypeError("Response data contains a sparse or accessor array");
                }
                copy.push(cloneFiniteJson(descriptor.value, active, state, depth + 1, immutable));
            }
            return immutable ? Object.freeze(copy) : copy;
        }
        const keys = Object.keys(value);
        if (Reflect.ownKeys(value).length !== keys.length) {
            throw new TypeError("Response data objects must contain enumerable string keys only");
        }
        const copy = Object.getPrototypeOf(value) === null
            ? Object.create(null)
            : {};
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor ||
                !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                throw new TypeError("Response data contains an accessor property");
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
function cloneResponseData(value, immutable) {
    const copy = cloneFiniteJson(value, new WeakSet(), { nodes: 0 }, 0, immutable);
    if (copy === null || Array.isArray(copy) || typeof copy !== "object") {
        throw new TypeError("Response data must be a finite JSON object");
    }
    return copy;
}
function canonicalFiniteJson(value) {
    if (value === null || typeof value !== "object") {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) {
            throw new TypeError("Response snapshot cannot be canonicalized");
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
function responseFingerprint(response) {
    const snapshot = cloneFiniteJson(response, new WeakSet(), { nodes: 0 }, 0, true);
    return canonicalFiniteJson(snapshot);
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
function compareStoredResponses(left, right) {
    const instantOrder = compareRfc3339Instants(left.authoredInstant, right.authoredInstant);
    if (instantOrder !== 0)
        return -instantOrder;
    return compareUnsignedBytes(left.responseIdBytes, right.responseIdBytes);
}
function selectedResponse(bucket) {
    if (bucket.responses.length === 0)
        return { status: "empty" };
    for (let index = 1; index < bucket.responses.length; index += 1) {
        const previous = bucket.responses[index - 1];
        const current = bucket.responses[index];
        if (previous &&
            current &&
            compareRfc3339Instants(previous.authoredInstant, current.authoredInstant) === 0 &&
            compareUnsignedBytes(previous.responseIdBytes, current.responseIdBytes) === 0) {
            return { status: "ambiguous" };
        }
    }
    const response = bucket.responses[0];
    return response ? { status: "selected", response } : { status: "empty" };
}
function admittedBuckets(catalogs) {
    const handlesByCatalogRef = new Map();
    for (const handle of catalogs) {
        const matches = handlesByCatalogRef.get(handle.catalogRef) ?? [];
        matches.push(handle);
        handlesByCatalogRef.set(handle.catalogRef, matches);
    }
    const result = new Map();
    for (const [catalogRef, handles] of handlesByCatalogRef) {
        // The existing Surface resolver treats repeated catalog handles as
        // ambiguous. The store follows the same fail-closed rule.
        if (handles.length !== 1)
            continue;
        const handle = handles[0];
        if (!handle)
            continue;
        const sourcesById = new Map();
        for (const source of handle.document.sources) {
            const matches = sourcesById.get(source.id) ?? [];
            matches.push(source);
            sourcesById.set(source.id, matches);
        }
        const buckets = new Map();
        for (const [sourceRef, sources] of sourcesById) {
            if (sources.length !== 1)
                continue;
            const source = sources[0];
            if (!source || !isDefinitionResponseSource(source))
                continue;
            buckets.set(sourceRef, {
                source,
                invocationFingerprints: new Map(),
                responses: [],
            });
        }
        if (buckets.size > 0)
            result.set(catalogRef, buckets);
    }
    return result;
}
/**
 * Create an isolated in-memory store for preview and test use.
 *
 * Production hosts must use durable, authorized persistence instead. This
 * helper intentionally loses all data when its process ends.
 */
export function createPreviewDefinitionResponseStore(catalogs) {
    const buckets = admittedBuckets(catalogs);
    const bucketFor = (binding) => buckets.get(binding.catalogRef)?.get(binding.sourceRef);
    const record = (input) => {
        const bucket = bucketFor(input.binding);
        if (!bucket)
            return { status: "refused", reason: "source-unavailable" };
        if (input.invocationId.length === 0) {
            return { status: "refused", reason: "invocation-id-missing" };
        }
        const { response } = input;
        if (response.definitionUrl !== bucket.source.definitionRef) {
            return { status: "refused", reason: "response-definition-mismatch" };
        }
        const draft = isDraftDefinitionResponseSource(bucket.source);
        if (!draft &&
            response.definitionVersion !== bucket.source.definitionVersion) {
            return { status: "refused", reason: "response-version-mismatch" };
        }
        const expectedStatus = draft
            ? "in-progress"
            : bucket.source.responseSelection.status;
        if (response.status !== expectedStatus) {
            return { status: "refused", reason: "response-status-mismatch" };
        }
        if (typeof response.id !== "string" || response.id.length === 0) {
            return { status: "refused", reason: "response-id-missing" };
        }
        const authoredInstant = parseRfc3339Instant(response.authored);
        if (!authoredInstant) {
            return { status: "refused", reason: "response-authored-invalid" };
        }
        let dataSnapshot;
        let fingerprint;
        try {
            dataSnapshot = cloneResponseData(response.data, true);
            fingerprint = responseFingerprint(response);
        }
        catch {
            return {
                status: "refused",
                reason: "response-data-not-finite-json",
            };
        }
        const priorFingerprint = bucket.invocationFingerprints.get(input.invocationId);
        if (priorFingerprint !== undefined) {
            return priorFingerprint === fingerprint
                ? { status: "duplicate" }
                : { status: "refused", reason: "invocation-payload-conflict" };
        }
        const stored = {
            dataSnapshot,
            authoredInstant,
            responseId: response.id,
            responseIdBytes: utf8Encoder.encode(response.id),
        };
        bucket.responses.push(stored);
        bucket.responses.sort(compareStoredResponses);
        bucket.invocationFingerprints.set(input.invocationId, fingerprint);
        const selection = selectedResponse(bucket);
        return {
            status: "recorded",
            selected: selection.status === "selected" && selection.response === stored,
        };
    };
    const overlay = (binding, baseline) => {
        const bucket = bucketFor(binding);
        if (!bucket)
            return baseline;
        const draft = bucket.source.runtime.delivery === "draft";
        if (!draft &&
            (baseline.status !== "loaded" || baseline.freshness !== "fresh")) {
            return baseline;
        }
        const selection = selectedResponse(bucket);
        if (selection.status === "empty") {
            return draft
                ? {
                    status: "unavailable",
                    reason: "No current-session Definition Response draft is available.",
                }
                : baseline;
        }
        if (selection.status === "ambiguous") {
            return {
                status: "unavailable",
                reason: "Definition Response selection is ambiguous because candidates share the same authored instant and Response id.",
            };
        }
        let value;
        try {
            // Never expose the immutable stored snapshot itself. Each consumer gets
            // a detached value, so local mutation cannot affect a later load.
            value = cloneResponseData(selection.response.dataSnapshot, false);
        }
        catch {
            return {
                status: "unavailable",
                reason: "The stored Definition Response snapshot is unavailable.",
            };
        }
        return {
            status: "loaded",
            freshness: "fresh",
            recordId: selection.response.responseId,
            value,
        };
    };
    const wrapLoader = (baselineLoader) => async (request) => {
        const baseline = await baselineLoader(request);
        return overlay({
            catalogRef: request.descriptor.catalogRef,
            sourceRef: request.descriptor.sourceRef,
        }, baseline);
    };
    return Object.freeze({ record, overlay, wrapLoader });
}
