/** @filedesc In-memory Definition Response deliveries for previews and tests. */
import { snapshotFiniteJson, canonicalFiniteJson } from "./finite-json.js";
import { catalogResponseSelection } from "./data-source-loader.js";
function sourceBucket(source) {
    if (source.kind !== "definition-response")
        return undefined;
    const draft = source.runtime.delivery === "draft";
    let selection;
    if (draft) {
        // Session draft delivery has its own admission rule. Rust still orders its records.
        if (typeof source.definitionRef !== "string" || !source.definitionRef
            || source.runtime.cache.mode !== "draft" || Object.hasOwn(source, "responseSelection"))
            return undefined;
        selection = {
            definition: { url: source.definitionRef },
            subject: [],
            status: "current",
            cardinality: "latest",
            pin: "none",
        };
    }
    else {
        const declared = catalogResponseSelection(source);
        if (source.definitionRef !== undefined || !declared)
            return undefined;
        selection = declared;
    }
    return { source, draft, selection, invocationFingerprints: new Map(), responses: [] };
}
export function catalogResponseProjection(schema, cardinality) {
    const shape = schema;
    const properties = cardinality === "latest-per-subject" ? shape?.items?.properties : shape?.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
        return Object.keys(properties);
    }
    return undefined;
}
function admittedBuckets(catalogs) {
    const buckets = new Map();
    const duplicateCatalogs = new Set();
    for (const { catalogRef, document } of catalogs) {
        if (buckets.has(catalogRef)) {
            duplicateCatalogs.add(catalogRef);
            continue;
        }
        const sources = new Map();
        const seen = new Set();
        for (const source of document.sources) {
            if (seen.has(source.id)) {
                sources.delete(source.id);
            }
            else {
                seen.add(source.id);
                const bucket = sourceBucket(source);
                if (bucket)
                    sources.set(source.id, bucket);
            }
        }
        buckets.set(catalogRef, sources);
    }
    for (const catalogRef of duplicateCatalogs)
        buckets.delete(catalogRef);
    return buckets;
}
/** Create an isolated in-memory store for an already admitted preview catalog. */
export function createPreviewDefinitionResponseStore(catalogs, options) {
    const buckets = admittedBuckets(catalogs);
    const bucketFor = (binding) => buckets.get(binding.catalogRef)?.get(binding.sourceRef);
    function read(binding, bucket, inputs, includeInputPositions = false) {
        const { source, draft, selection, responses } = bucket;
        // Mapping-backed reads require the projection check tracked in fs-fea7.
        if (selection.mapping !== undefined)
            return { status: "unavailable" };
        try {
            const context = options.selectionContext(binding, selection, inputs);
            if (context?.upstreamSubject === undefined)
                return { status: "unavailable" };
            const { upstreamSubject, dispositions, pin } = context;
            const projection = draft ? undefined : catalogResponseProjection(source.schema, selection.cardinality);
            return options.selectResponses(responses, selection, {
                upstreamSubject,
                ...(dispositions !== undefined && { dispositions }),
                ...(pin !== undefined && { pin }),
                ...(projection !== undefined && { projection }),
                scope: binding.catalogRef,
                authorized: true,
                source: "catalog",
                includeInputPositions,
                ...(inputs && { routeParams: inputs.params }),
                ...(inputs?.subject && { consumerSubject: inputs.subject.keys }),
            });
        }
        catch {
            return { status: "unavailable" };
        }
    }
    function record(input) {
        const bucket = bucketFor(input.binding);
        if (!bucket)
            return { status: "refused", reason: "source-unavailable" };
        if (!input.invocationId)
            return { status: "refused", reason: "invocation-id-missing" };
        const implicitSubjectId = bucket.draft ? input.binding.sourceRef : input.implicitSubjectId;
        let response;
        let fingerprint;
        try {
            const snapshot = snapshotFiniteJson(input.response, true);
            response = snapshot;
            if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
                throw new TypeError("Response data must be an object");
            }
            fingerprint = canonicalFiniteJson([snapshot, implicitSubjectId ?? null]);
        }
        catch {
            return { status: "refused", reason: "response-data-not-finite-json" };
        }
        if (response.definitionUrl !== bucket.selection.definition.url) {
            return { status: "refused", reason: "response-definition-mismatch" };
        }
        if (bucket.draft && response.status !== "in-progress") {
            return { status: "refused", reason: "response-status-mismatch" };
        }
        if (typeof response.id !== "string" || !response.id) {
            return { status: "refused", reason: "response-id-missing" };
        }
        if (typeof response.authored !== "string" || !options.isValidResponseAuthored(response.authored)) {
            return { status: "refused", reason: "response-authored-invalid" };
        }
        const prior = bucket.invocationFingerprints.get(input.invocationId);
        if (prior !== undefined) {
            return prior === fingerprint
                ? { status: "duplicate" }
                : { status: "refused", reason: "invocation-payload-conflict" };
        }
        const position = bucket.responses.length;
        bucket.responses.push({
            scope: input.binding.catalogRef,
            response,
            ...(implicitSubjectId && { implicitSubjectId }),
        });
        bucket.invocationFingerprints.set(input.invocationId, fingerprint);
        const result = read(input.binding, bucket, input.context, true);
        return {
            status: "recorded",
            selected: result.status === "available" && result.inputPositions?.includes(position) === true,
        };
    }
    function overlay({ catalogRef, sourceRef }, baseline, inputs) {
        const binding = { catalogRef, sourceRef };
        const bucket = bucketFor(binding);
        if (!bucket || (!bucket.draft && (baseline.status !== "loaded" || baseline.freshness !== "fresh"))) {
            return baseline;
        }
        const result = read(binding, bucket, inputs);
        if (result.status === "unavailable") {
            return {
                ...binding,
                status: "unavailable",
                reason: bucket.draft
                    ? "No current-session Definition Response draft is available."
                    : "Definition Response selection is unavailable.",
            };
        }
        if (bucket.draft) {
            return {
                ...binding,
                status: "loaded",
                freshness: "fresh",
                recordId: result.records[0]?.responseId,
                value: result.value,
            };
        }
        const { value, records, valueDigest, none, newer } = result;
        return { ...binding, status: "loaded", freshness: "fresh", value, records, valueDigest, none, ...(newer && { newer }) };
    }
    const wrapLoader = (baselineLoader) => async (request) => overlay(request.descriptor, await baselineLoader(request), request.context);
    return Object.freeze({ record, overlay, wrapLoader });
}
