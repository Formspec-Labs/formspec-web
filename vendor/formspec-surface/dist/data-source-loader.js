import { surfaceDiagnostic, } from './diagnostics.js';
function own(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key);
}
/**
 * Resolve only an exact manifested catalog URL and an exact source id within
 * it. Repeated matches are ambiguous and resolve to nothing.
 */
export function resolveDataSourceDescriptor(catalogs, binding) {
    const catalogMatches = catalogs.filter((candidate) => candidate.catalogRef === binding.catalogRef);
    if (catalogMatches.length !== 1)
        return undefined;
    const handle = catalogMatches[0];
    if (!handle)
        return undefined;
    const sourceMatches = handle.document.sources.filter((source) => source.id === binding.sourceRef);
    if (sourceMatches.length !== 1)
        return undefined;
    const source = sourceMatches[0];
    if (!source)
        return undefined;
    return {
        catalogRef: binding.catalogRef,
        sourceRef: binding.sourceRef,
        catalog: handle.document,
        source,
    };
}
/**
 * Data Sources §5 availability at a module-widget use site.
 * Definition-only availability never covers a widget.
 */
export function dataSourceAvailableToWidget(descriptor, context) {
    const availability = descriptor.source.availability;
    switch (availability.level) {
        case 'app':
            return true;
        case 'definition':
            return false;
        case 'surface':
            return (context.surfaceRef !== undefined &&
                availability.surfaceRef === context.surfaceRef);
        case 'route':
            return (context.surfaceRef !== undefined &&
                availability.surfaceRef === context.surfaceRef &&
                availability.routeRef === context.routeId);
        case 'slot':
            return (context.surfaceRef !== undefined &&
                availability.surfaceRef === context.surfaceRef &&
                availability.routeRef === context.routeId &&
                availability.slotId === context.slotId);
        case 'module':
            return availability.moduleId === context.moduleId;
    }
}
function planFailure(input) {
    if (input.status === 'ready')
        return undefined;
    const reason = input.status === 'unbound'
        ? 'unbound'
        : input.status === 'unresolved'
            ? 'unresolved'
            : 'unavailable';
    return {
        inputName: input.name,
        required: input.required,
        reason,
        message: input.reason,
        ...(input.descriptor
            ? { failureMode: input.descriptor.source.runtime.failureMode }
            : {}),
    };
}
function runtimeFailure(input, reason, message) {
    return {
        inputName: input.name,
        required: input.required,
        reason,
        message,
        failureMode: input.descriptor.source.runtime.failureMode,
    };
}
function diagnosticForFailure(failure, site) {
    return surfaceDiagnostic('WIDGET-DATA-REQUIRED-UNAVAILABLE', `Required widget input "${failure.inputName}" is unavailable: ${failure.message}`, site, {
        inputName: failure.inputName,
        reason: failure.reason,
        ...(failure.failureMode ? { failureMode: failure.failureMode } : {}),
    });
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Load every declared input in Registry order. No partial object reaches the
 * widget unless every required input succeeds. `degraded-widget` may omit a
 * failed optional input; no other failure mode manufactures a success value.
 */
export async function loadWidgetDataInputs(request) {
    const data = {};
    const failures = [];
    const degradedInputs = [];
    for (const input of request.inputs) {
        if (input.status !== 'ready') {
            const plannedFailure = planFailure(input);
            if (!plannedFailure)
                continue;
            if (input.required) {
                failures.push(plannedFailure);
            }
            else if (plannedFailure.failureMode === 'degraded-widget') {
                degradedInputs.push(plannedFailure);
            }
            else if (input.status !== 'unbound') {
                failures.push(plannedFailure);
            }
            continue;
        }
        if (!dataSourceAvailableToWidget(input.descriptor, request.context)) {
            const failure = runtimeFailure(input, 'unavailable', 'its availability selector does not cover this widget');
            if (!input.required && failure.failureMode === 'degraded-widget') {
                degradedInputs.push(failure);
            }
            else {
                failures.push(failure);
            }
            continue;
        }
        if (!request.authorize) {
            const failure = runtimeFailure(input, 'unauthorized', 'the host supplied no authorization decision');
            if (!input.required && failure.failureMode === 'degraded-widget') {
                degradedInputs.push(failure);
            }
            else {
                failures.push(failure);
            }
            continue;
        }
        let authorization;
        try {
            authorization = await request.authorize({
                descriptor: input.descriptor,
                context: request.context,
            });
        }
        catch (error) {
            authorization = { status: 'refused', reason: errorText(error) };
        }
        if (authorization.status !== 'authorized') {
            const failure = runtimeFailure(input, 'unauthorized', authorization.reason ?? 'the host refused access');
            if (!input.required && failure.failureMode === 'degraded-widget') {
                degradedInputs.push(failure);
            }
            else {
                failures.push(failure);
            }
            continue;
        }
        if (!request.loader) {
            const failure = runtimeFailure(input, 'load-failed', 'the host supplied no DataSourceLoader');
            if (!input.required && failure.failureMode === 'degraded-widget') {
                degradedInputs.push(failure);
            }
            else {
                failures.push(failure);
            }
            continue;
        }
        let loaded;
        try {
            loaded = await request.loader({
                descriptor: input.descriptor,
                context: request.context,
            });
        }
        catch (error) {
            loaded = { status: 'unavailable', reason: errorText(error) };
        }
        if (loaded.status !== 'loaded') {
            const failure = runtimeFailure(input, 'load-failed', loaded.reason);
            if (!input.required && failure.failureMode === 'degraded-widget') {
                degradedInputs.push(failure);
            }
            else {
                failures.push(failure);
            }
            continue;
        }
        if (loaded.freshness === 'stale' &&
            input.descriptor.source.runtime.failureMode !== 'stale-ok') {
            const failure = runtimeFailure(input, 'stale-disallowed', 'the loader returned stale data and the catalog does not allow it');
            if (!input.required && failure.failureMode === 'degraded-widget') {
                degradedInputs.push(failure);
            }
            else {
                failures.push(failure);
            }
            continue;
        }
        const schema = input.descriptor.source.schema;
        if (schema !== undefined) {
            let validation;
            if (!request.validatePayload) {
                validation = {
                    valid: false,
                    reason: 'the source declares a payload schema and the host supplied no validator',
                };
            }
            else {
                try {
                    validation = await request.validatePayload({
                        descriptor: input.descriptor,
                        context: request.context,
                        schema,
                        value: loaded.value,
                    });
                }
                catch (error) {
                    validation = { valid: false, reason: errorText(error) };
                }
            }
            if (!validation.valid) {
                const failure = runtimeFailure(input, 'payload-invalid', validation.reason ?? 'payload validation failed');
                if (!input.required && failure.failureMode === 'degraded-widget') {
                    degradedInputs.push(failure);
                }
                else {
                    failures.push(failure);
                }
                continue;
            }
        }
        // The name came from a Registry declaration. `own` prevents a malformed
        // declaration named `__proto__` from mutating the result object.
        if (!own(data, input.name)) {
            Object.defineProperty(data, input.name, {
                value: loaded.value,
                enumerable: true,
                configurable: false,
                writable: false,
            });
        }
    }
    const requiredFailures = failures.filter((failure) => failure.required);
    const diagnostics = requiredFailures.map((failure) => diagnosticForFailure(failure, request.site));
    if (failures.length > 0) {
        return {
            status: 'unavailable',
            failures,
            diagnostics,
        };
    }
    return {
        status: 'ready',
        data: Object.freeze(data),
        degradedInputs,
        diagnostics,
    };
}
/**
 * Production bridge for the `document-resource` URL family. The host injects
 * its HTTP client so origin policy, credentials, telemetry, and retries remain
 * host concerns. Non-HTTP provenance and other source families fail closed.
 */
export function createDocumentResourceDataSourceLoader(read) {
    return async (request) => {
        if (request.descriptor.source.kind !== 'document-resource') {
            return {
                status: 'unavailable',
                reason: `unsupported source kind "${request.descriptor.source.kind}"`,
            };
        }
        const url = request.descriptor.source.runtime.provenance.source;
        if (!/^https?:\/\//u.test(url)) {
            return {
                status: 'unavailable',
                reason: 'document-resource provenance is not an HTTP(S) URL',
            };
        }
        return read({ ...request, url });
    };
}
