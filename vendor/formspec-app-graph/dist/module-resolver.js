/** @filedesc Shared ModuleResolver kernel for module admission and contribution evidence. */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { evaluateModulePostureAdmission, } from './posture-admission.js';
import { resolveWidgetContribution } from './widget-contribution.js';
const MODULE_PHASE = 'module-resolution';
const MODULE_ORIGIN = 'module-resolver';
const CUSTOM_TOKEN_CATEGORY_PREFIX_PATTERN = /^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/;
const EXTENSION_NAME_PATTERN = /^x-/;
const WIDGET_SHAPE_PROPS_VALIDATOR = 'widgetShape.props';
const modulePayloadAjv = new Ajv2020({
    allErrors: true,
    strict: false,
    strictSchema: true,
    validateSchema: true,
});
addFormats(modulePayloadAjv);
function sourceForKind(kind) {
    return `memory://${kind}`;
}
function cloneRef(ref) {
    const cloned = {
        id: ref.id,
        version: ref.version,
    };
    if (ref.publisher !== undefined)
        cloned.publisher = ref.publisher;
    if (ref.lockHash !== undefined)
        cloned.lockHash = ref.lockHash;
    const extensions = ref.extensions;
    if (extensions !== undefined) {
        cloned.extensions = { ...extensions };
    }
    return cloned;
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function recordArray(value) {
    if (!Array.isArray(value))
        return [];
    const records = [];
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index))
            continue;
        const entry = asRecord(value[index]);
        if (entry)
            records.push(entry);
    }
    return records;
}
function stringValue(value) {
    return typeof value === 'string' ? value : undefined;
}
function ownValue(value, key) {
    return value && Object.prototype.hasOwnProperty.call(value, key)
        ? value[key]
        : undefined;
}
function extensionName(value) {
    const name = stringValue(value);
    return name && EXTENSION_NAME_PATTERN.test(name) ? name : undefined;
}
function escapeJsonPointerToken(token) {
    return token.replace(/~/g, '~0').replace(/\//g, '~1');
}
function errorProperty(error) {
    if (error.keyword === 'required') {
        const missingProperty = error.params.missingProperty;
        return typeof missingProperty === 'string' ? missingProperty : undefined;
    }
    if (error.keyword === 'additionalProperties' || error.keyword === 'unevaluatedProperties') {
        const additionalProperty = error.params
            .additionalProperty
            ?? error.params.unevaluatedProperty;
        return typeof additionalProperty === 'string' ? additionalProperty : undefined;
    }
    return undefined;
}
function payloadErrorPath(error) {
    const property = errorProperty(error);
    const pointer = property
        ? `${error.instancePath}/${escapeJsonPointerToken(property)}`
        : error.instancePath;
    return pointer || undefined;
}
function pointerDepth(pointer) {
    return pointer?.split('/').filter(Boolean).length ?? 0;
}
function comparePayloadErrors(left, right) {
    const leftPath = payloadErrorPath(left);
    const rightPath = payloadErrorPath(right);
    return pointerDepth(rightPath) - pointerDepth(leftPath)
        || (leftPath ?? '').localeCompare(rightPath ?? '')
        || left.keyword.localeCompare(right.keyword)
        || left.schemaPath.localeCompare(right.schemaPath)
        || (left.message ?? '').localeCompare(right.message ?? '');
}
function invalidPayloadResult(error) {
    const path = payloadErrorPath(error);
    return {
        ok: false,
        reason: 'payload-schema-mismatch',
        ...(path ? { path } : {}),
        keyword: error.keyword,
        ...(error.message ? { message: error.message } : {}),
        schemaPath: error.schemaPath,
    };
}
/**
 * Execute Registry `widgetShape.props` as JSON Schema for AppGraph payloads.
 * Invalid or unevaluable schemas fail closed instead of allowing authored
 * configuration to pass without a result.
 */
const validateWidgetShapeProps = ({ payload, schema }) => {
    const schemaObject = asRecord(schema);
    if (!schemaObject) {
        return {
            ok: false,
            reason: 'payload-schema-invalid',
            message: 'widgetShape.props must be a JSON Schema object',
        };
    }
    try {
        if (!modulePayloadAjv.validateSchema(schemaObject)) {
            const error = [...(modulePayloadAjv.errors ?? [])].sort(comparePayloadErrors)[0];
            return {
                ok: false,
                reason: 'payload-schema-invalid',
                ...(error?.keyword ? { keyword: error.keyword } : {}),
                ...(error?.message ? { message: error.message } : {}),
                ...(error?.instancePath ? { schemaFragmentPath: error.instancePath } : {}),
                ...(error?.schemaPath ? { schemaPath: error.schemaPath } : {}),
            };
        }
        const validate = modulePayloadAjv.compile(schemaObject);
        if (validate(payload))
            return { ok: true };
        const error = [...(validate.errors ?? [])].sort(comparePayloadErrors)[0];
        return error
            ? invalidPayloadResult(error)
            : {
                ok: false,
                reason: 'payload-schema-mismatch',
                message: 'JSON Schema validation failed without an error location',
            };
    }
    catch (error) {
        return {
            ok: false,
            reason: 'payload-schema-evaluation-failed',
            message: error instanceof Error ? error.message : String(error),
        };
    }
};
function appGraphModuleSupport(support) {
    return {
        ...(support ?? {}),
        payloadSchemaValidators: [
            WIDGET_SHAPE_PROPS_VALIDATOR,
            ...(support?.payloadSchemaValidators ?? []).filter((name) => name !== WIDGET_SHAPE_PROPS_VALIDATOR),
        ],
        payloadValidators: {
            ...(support?.payloadValidators ?? {}),
            [WIDGET_SHAPE_PROPS_VALIDATOR]: validateWidgetShapeProps,
        },
    };
}
function cloneGraphRef(ref) {
    if (!ref)
        return undefined;
    const cloned = {};
    if (typeof ref.url === 'string')
        cloned.url = ref.url;
    if (typeof ref.version === 'string')
        cloned.version = ref.version;
    if (typeof ref.handle === 'string')
        cloned.handle = ref.handle;
    if (typeof ref.locale === 'string')
        cloned.locale = ref.locale;
    for (const [key, value] of Object.entries(ref)) {
        if (key.startsWith('x-')) {
            cloned[key] = value;
        }
    }
    return Object.keys(cloned).length > 0 ? cloned : undefined;
}
function sourceForGraphHandle(handle, jsonPointer, module) {
    const source = {
        artifactSlot: handle.slot,
        artifactKind: handle.artifactKind,
        source: handle.source ?? sourceForKind(handle.artifactKind),
        jsonPointer,
    };
    const ref = cloneGraphRef(handle.ref);
    if (ref)
        source.ref = ref;
    if (module)
        source.module = cloneRef(module);
    return source;
}
function sourceForHostEvidence(index, source, jsonPointer) {
    return {
        artifactSlot: `hostEvidence.uiGraphPolicies[${index}]`,
        artifactKind: 'hostEvidence',
        source,
        jsonPointer,
    };
}
function moduleInputFromRecord(record, source) {
    const id = stringValue(record.id);
    const version = stringValue(record.version);
    if (!id || !version)
        return undefined;
    const module = {
        id,
        version,
        source: { ...source, module: { id, version } },
    };
    const publisher = stringValue(record.publisher);
    const lockHash = stringValue(record.lockHash);
    if (publisher !== undefined)
        module.publisher = publisher;
    if (lockHash !== undefined)
        module.lockHash = lockHash;
    const extensions = asRecord(record.extensions);
    if (extensions) {
        const extensionValues = Object.fromEntries(Object.entries(extensions).filter(([key]) => key.startsWith('x-')));
        if (Object.keys(extensionValues).length > 0) {
            module.extensions = extensionValues;
        }
    }
    if (publisher !== undefined || lockHash !== undefined || module.extensions !== undefined) {
        module.source = { ...source, module: cloneRef(module) };
    }
    return module;
}
function moduleInputsFromDocument(handle, document) {
    return recordArray(document.modules).flatMap((entry, index) => {
        const module = moduleInputFromRecord(entry, sourceForGraphHandle(handle, `/modules/${index}`));
        return module ? [module] : [];
    });
}
function graphHandleKey(handle) {
    const ref = handle.ref ?? {};
    return [
        handle.slot,
        handle.artifactKind,
        handle.source ?? '',
        ref.url ?? '',
        ref.version ?? '',
        handle.status,
    ].join('\u0000');
}
function graphHandles(input) {
    const handles = [];
    const seen = new Set();
    for (const handle of [input.manifest, ...input.handles]) {
        const key = graphHandleKey(handle);
        if (seen.has(key))
            continue;
        seen.add(key);
        handles.push(handle);
    }
    return handles;
}
function loadedDocument(handle) {
    if (handle.status !== 'loaded')
        return undefined;
    return asRecord(handle.document);
}
function registryInputFromHandle(handle) {
    if (handle.artifactKind !== 'registry')
        return undefined;
    const document = loadedDocument(handle);
    if (!document)
        return undefined;
    const entries = recordArray(ownValue(document, 'entries')).flatMap((entry) => {
        const name = stringValue(ownValue(entry, 'name'));
        const category = stringValue(ownValue(entry, 'category'));
        return name && category ? [{ ...entry, name, category }] : [];
    });
    if (entries.length === 0)
        return undefined;
    return {
        entries,
        artifactSlot: handle.slot,
        artifactKind: 'registry',
        source: handle.source ?? sourceForKind(handle.artifactKind),
    };
}
function surfaceUses(handle, document, registries) {
    return recordArray(ownValue(document, 'routes')).flatMap((route, routeIndex) => recordArray(ownValue(route, 'slots')).flatMap((slot, slotIndex) => {
        if (ownValue(slot, 'slotType') !== 'module-widget')
            return [];
        const binding = asRecord(ownValue(slot, 'binding'));
        if (!binding)
            return [];
        const moduleId = stringValue(ownValue(binding, 'moduleId'));
        const widgetName = stringValue(ownValue(binding, 'widgetName'));
        if (!moduleId || !widgetName)
            return [];
        // Surface binding names use `widgetShape.widgetName`. UI Graph Policy
        // widget refs use contribution ids directly and must not pass through
        // this lookup; the identical JSON key belongs to a different vocabulary.
        const contribution = resolveWidgetContribution({ moduleId, widgetName }, registries.flatMap((registry) => registry.entries));
        const name = contribution?.name ?? widgetName;
        const use = {
            site: 'surface.module-widget.binding.widgetName',
            name,
            expectedCategory: 'widget',
            expectedOwnerModuleId: moduleId,
            source: sourceForGraphHandle(handle, `/routes/${routeIndex}/slots/${slotIndex}/binding/widgetName`),
        };
        const config = ownValue(binding, 'config');
        if (config !== undefined) {
            use.payload = config;
            use.payloadSource = sourceForGraphHandle(handle, `/routes/${routeIndex}/slots/${slotIndex}/binding/config`);
        }
        return [use];
    }));
}
function experienceUses(handle, document) {
    return recordArray(document.units).flatMap((unit, index) => {
        const name = extensionName(unit.kind);
        return name ? [{
                site: 'experience.units.kind',
                name,
                expectedCategory: 'unit-kind',
                source: sourceForGraphHandle(handle, `/units/${index}/kind`),
            }] : [];
    });
}
function themeWidgetUse(handle, site, name, sourcePointer, payload, payloadPointer) {
    if (!name)
        return [];
    const use = {
        site,
        name,
        expectedCategory: 'widget',
        source: sourceForGraphHandle(handle, sourcePointer),
    };
    if (payload !== undefined) {
        use.payload = payload;
        use.payloadSource = sourceForGraphHandle(handle, payloadPointer);
    }
    return [use];
}
function themeBlockUses(handle, block, pointer) {
    const record = asRecord(block);
    if (!record)
        return [];
    return themeWidgetUse(handle, 'theme.presentation.widget', extensionName(record.widget), `${pointer}/widget`, record.widgetConfig, `${pointer}/widgetConfig`);
}
function themeUses(handle, document) {
    const uses = [
        ...themeBlockUses(handle, document.defaults, '/defaults'),
        ...recordArray(document.selectors).flatMap((selector, index) => themeBlockUses(handle, selector.apply, `/selectors/${index}/apply`)),
    ];
    const items = asRecord(document.items);
    if (items) {
        for (const [key, block] of Object.entries(items)) {
            uses.push(...themeBlockUses(handle, block, `/items/${escapeJsonPointerToken(key)}`));
        }
    }
    return uses;
}
function responseActionUses(handle, document) {
    return recordArray(document.actions).flatMap((action, index) => {
        const name = extensionName(action.intent);
        return name ? [{
                site: 'response-actions.actions.intent',
                name,
                expectedCategory: 'action-intent',
                source: sourceForGraphHandle(handle, `/actions/${index}/intent`),
            }] : [];
    });
}
function documentUses(handle, document, registries) {
    switch (handle.artifactKind) {
        case 'experience':
            return experienceUses(handle, document);
        case 'surface':
            return surfaceUses(handle, document, registries);
        case 'theme':
            return themeUses(handle, document);
        case 'responseActions':
        case 'response-actions':
            return responseActionUses(handle, document);
        default:
            return [];
    }
}
function documentInputFromHandle(handle, registries) {
    if (handle.artifactKind === 'appManifest' || handle.artifactKind === 'registry')
        return undefined;
    const document = loadedDocument(handle);
    if (!document)
        return undefined;
    const modules = moduleInputsFromDocument(handle, document);
    const uses = documentUses(handle, document, registries);
    if (modules.length === 0 && uses.length === 0)
        return undefined;
    return {
        artifactSlot: handle.slot,
        artifactKind: handle.artifactKind,
        source: handle.source ?? sourceForKind(handle.artifactKind),
        ...(modules.length > 0 ? { modules } : {}),
        ...(uses.length > 0 ? { uses } : {}),
    };
}
/**
 * `widgetRef.widgetName` is used as the contribution name **verbatim**, unlike
 * the Surface path at {@link surfaceUses}, which resolves
 * `widgetShape.widgetName` through {@link resolveWidgetContribution}. That is
 * correct, not an oversight: this field uses the `RegistryEntry.name`
 * vocabulary, so it is already the contribution id. Keep those vocabularies
 * distinct per ADR 0160 §2.4.
 */
function uiGraphPolicyUses(evidence, evidenceIndex) {
    const document = asRecord(evidence.document);
    const theme = asRecord(document?.theme);
    return recordArray(theme?.assignments).flatMap((assignment, index) => {
        const widgetRef = asRecord(assignment.widgetRef);
        const name = stringValue(widgetRef?.widgetName);
        const moduleId = stringValue(widgetRef?.moduleId);
        return name ? [{
                site: 'ui-graph-policy.theme.assignments.widgetRef',
                name,
                expectedCategory: 'widget',
                ...(moduleId ? { expectedOwnerModuleId: moduleId } : {}),
                source: sourceForHostEvidence(evidenceIndex, evidence.source, `/theme/assignments/${index}/widgetRef`),
            }] : [];
    });
}
function hostEvidenceDocuments(hostEvidence) {
    return (hostEvidence?.uiGraphPolicies ?? []).flatMap((evidence, index) => {
        const uses = uiGraphPolicyUses(evidence, index);
        return uses.length > 0 ? [{
                artifactSlot: `hostEvidence.uiGraphPolicies[${index}]`,
                artifactKind: 'hostEvidence',
                source: evidence.source,
                uses,
            }] : [];
    });
}
export function moduleResolverInputFromAppGraph(input) {
    const handles = graphHandles(input);
    const manifestDocument = loadedDocument(input.manifest);
    const appModules = manifestDocument ? moduleInputsFromDocument(input.manifest, manifestDocument) : [];
    const registries = handles.flatMap((handle) => {
        const registry = registryInputFromHandle(handle);
        return registry ? [registry] : [];
    });
    const documents = [
        ...handles.flatMap((handle) => {
            const document = documentInputFromHandle(handle, registries);
            return document ? [document] : [];
        }),
        ...hostEvidenceDocuments(input.hostEvidence),
    ];
    return {
        appModules,
        ...(documents.length > 0 ? { documents } : {}),
        registries,
        ...(input.admission ? { admission: input.admission } : {}),
        support: appGraphModuleSupport(input.support),
        ...(input.source ? { source: input.source } : (input.manifest.source ? { source: input.manifest.source } : {})),
    };
}
function moduleSource(ref, jsonPointer, source = 'memory://app') {
    return {
        artifactSlot: 'app',
        artifactKind: 'appManifest',
        source,
        jsonPointer,
        module: cloneRef(ref),
    };
}
function registrySource(registry, input, jsonPointer = `/entries/${registry.entryIndex}`) {
    const registryInput = input.registries[registry.registryIndex];
    return {
        artifactSlot: registryInput.artifactSlot ?? `registries[${registry.registryIndex}]`,
        artifactKind: 'registry',
        source: registryInput.source ?? 'memory://registry',
        jsonPointer,
    };
}
function documentSource(document, jsonPointer, module) {
    const source = {
        artifactSlot: document.artifactSlot,
        artifactKind: document.artifactKind,
        source: document.source ?? sourceForKind(document.artifactKind),
        jsonPointer,
    };
    if (module)
        source.module = cloneRef(module);
    return source;
}
function diagnostic(code, message, primarySource, extra = {}) {
    return {
        code,
        severity: 'error',
        phase: MODULE_PHASE,
        origin: MODULE_ORIGIN,
        message,
        primarySource,
        ...extra,
    };
}
function buildRegistryIndex(registries) {
    const modulesById = new Map();
    const entriesByName = new Map();
    const entriesByNameAll = new Map();
    const contributedBy = new Map();
    registries.forEach((registry, registryIndex) => {
        registry.entries.forEach((entry, entryIndex) => {
            const record = { entry, registryIndex, entryIndex };
            entriesByName.set(entry.name, record);
            const allNamedEntries = entriesByNameAll.get(entry.name) ?? [];
            allNamedEntries.push(record);
            entriesByNameAll.set(entry.name, allNamedEntries);
            if (entry.category === 'module') {
                modulesById.set(entry.name, record);
                for (const contribution of entry.contributes ?? []) {
                    const owners = contributedBy.get(contribution) ?? [];
                    owners.push(record);
                    contributedBy.set(contribution, owners);
                }
            }
        });
    });
    return { modulesById, entriesByName, entriesByNameAll, contributedBy };
}
function parseSemver(value) {
    const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/.exec(value);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}
function versionSatisfies(requested, actual) {
    if (!actual)
        return false;
    if (requested === actual)
        return true;
    if (!requested.startsWith('^'))
        return false;
    const base = parseSemver(requested.slice(1));
    const candidate = parseSemver(actual);
    return !!base && !!candidate && candidate[0] === base[0] && (candidate[1] > base[1] || (candidate[1] === base[1] && candidate[2] >= base[2]));
}
function admissionMismatch(ref, admission) {
    if (!admission?.allowedModules?.length) {
        return undefined;
    }
    const postureRef = {
        id: ref.id,
        version: ref.version,
        publisher: ref.publisher,
        lockHash: ref.lockHash,
    };
    const result = evaluateModulePostureAdmission(postureRef, admission.allowedModules);
    if (result.admitted) {
        return undefined;
    }
    if (result.reason === 'not-listed') {
        return { reason: 'not-listed' };
    }
    return { reason: 'field-mismatch', field: result.field };
}
function moduleInputs(input) {
    const defaultModules = input.support?.defaultModules ?? [];
    return [
        ...defaultModules.map((ref) => ({
            ref,
            defaulted: true,
            pointer: `/modules/default/${ref.id}`,
        })),
        ...input.appModules.map((ref, index) => ({
            ref,
            defaulted: false,
            pointer: `/modules/${index}`,
        })),
    ];
}
function resolveAppModules(input, index) {
    const modules = [];
    const diagnostics = [];
    const states = new Map();
    const inputs = moduleInputs(input);
    for (const appModule of inputs) {
        const ref = cloneRef(appModule.ref);
        const source = appModule.ref.source ?? moduleSource(ref, appModule.pointer, input.source ?? 'memory://app');
        const registry = index.modulesById.get(ref.id);
        const report = {
            ref,
            status: 'admitted',
            source,
        };
        if (appModule.defaulted)
            report.defaulted = true;
        if (!appModule.defaulted && inputs.some((entry) => entry.defaulted && entry.ref.id === ref.id)) {
            report.defaulted = false;
        }
        if (!registry) {
            const unresolved = diagnostic('MODULE-UNRESOLVED', `App module '${ref.id}' is absent from the Registry module index.`, source);
            report.status = 'unresolved';
            report.diagnostics = [unresolved];
            diagnostics.push(unresolved);
        }
        else {
            report.registryVersion = registry.entry.version;
            if (!versionSatisfies(ref.version, registry.entry.version)) {
                report.status = 'unresolved';
                diagnostics.push(diagnostic('MODULE-VERSION-UNRESOLVED', `Registry module '${ref.id}@${registry.entry.version}' does not satisfy requested range '${ref.version}'.`, source, { details: { registryVersion: registry.entry.version, requestedVersion: ref.version } }));
            }
            else {
                const mismatch = admissionMismatch(ref, input.admission);
                if (mismatch) {
                    report.status = 'denied';
                    const details = {};
                    if (mismatch.field === 'lockHash') {
                        const postureEntry = input.admission?.allowedModules?.find((entry) => entry.id === ref.id);
                        details.expectedLockHash = postureEntry?.lockHash;
                        details.actualLockHash = ref.lockHash;
                    }
                    else if (mismatch.field === 'publisher') {
                        const postureEntry = input.admission?.allowedModules?.find((entry) => entry.id === ref.id);
                        details.expectedPublisher = postureEntry?.publisher;
                        details.actualPublisher = ref.publisher;
                    }
                    else if (mismatch.field === 'version') {
                        const postureEntry = input.admission?.allowedModules?.find((entry) => entry.id === ref.id);
                        details.expectedVersion = postureEntry?.version;
                        details.actualVersion = ref.version;
                    }
                    else if (mismatch.reason === 'not-listed') {
                        details.reason = 'not-listed';
                    }
                    diagnostics.push(diagnostic('MODULE-ADMISSION-DENIED', `Host admission evidence denies module '${ref.id}@${ref.version}'.`, source, Object.keys(details).length > 0 ? { details } : undefined));
                }
            }
        }
        modules.push(report);
        states.set(ref.id, { report, registry });
    }
    for (const state of states.values()) {
        const dependencies = state.registry?.entry.dependencies ?? [];
        if (state.report.status !== 'admitted' || dependencies.length === 0)
            continue;
        const missing = dependencies.find((dependency) => {
            const dependencyState = states.get(dependency.id);
            return !dependencyState
                || dependencyState.report.status !== 'admitted'
                || !versionSatisfies(dependency.version, dependencyState.registry?.entry.version);
        });
        if (!missing || !state.registry)
            continue;
        state.report.status = 'dependency-unresolved';
        diagnostics.push(diagnostic('MODULE-DEPENDENCY-UNRESOLVED', `Module '${state.report.ref.id}' depends on '${missing.id}@${missing.version}', but the app module set does not admit it.`, {
            ...registrySource(state.registry, input, `/entries/${state.registry.entryIndex}/dependencies/${dependencies.indexOf(missing)}`),
            module: cloneRef(missing),
        }, { relatedSources: [state.report.source] }));
    }
    return { modules, diagnostics, states };
}
function resolveDocuments(documents, moduleStates, input) {
    const reports = [];
    const diagnostics = [];
    for (const document of documents) {
        if (!document.modules || document.modules.length === 0) {
            if ((input.support?.defaultModules ?? []).length === 0)
                continue;
            reports.push({
                artifactSlot: document.artifactSlot,
                artifactKind: document.artifactKind,
                status: 'defaulted',
                modules: [],
                effectiveModules: (input.support?.defaultModules ?? []).map(cloneRef),
                source: documentSource(document, '/modules/default'),
            });
            continue;
        }
        const missingIndex = document.modules.findIndex((ref) => {
            const state = moduleStates.get(ref.id);
            return !state || state.report.status === 'unresolved' || state.report.status === 'dependency-unresolved';
        });
        const deniedIndex = missingIndex < 0
            ? document.modules.findIndex((ref) => moduleStates.get(ref.id)?.report.status === 'denied')
            : -1;
        const versionMismatchIndex = missingIndex < 0 && deniedIndex < 0
            ? document.modules.findIndex((ref) => {
                const state = moduleStates.get(ref.id);
                return !!state?.registry && !versionSatisfies(ref.version, state.registry.entry.version);
            })
            : -1;
        const problemIndex = [missingIndex, deniedIndex, versionMismatchIndex].find((index) => index >= 0) ?? -1;
        const sourceModule = document.modules[problemIndex >= 0 ? problemIndex : 0];
        const source = sourceModule.source ?? documentSource(document, problemIndex >= 0 ? `/modules/${problemIndex}` : '/modules/0', sourceModule);
        const report = {
            artifactSlot: document.artifactSlot,
            artifactKind: document.artifactKind,
            status: problemIndex >= 0
                ? (deniedIndex >= 0 ? 'admission-denied' : (versionMismatchIndex >= 0 ? 'version-mismatch' : 'undeclared-module'))
                : 'coherent',
            modules: document.modules.map(cloneRef),
            source,
        };
        if (problemIndex < 0) {
            report.effectiveModules = document.modules.map(cloneRef);
        }
        else {
            const ref = document.modules[problemIndex];
            if (deniedIndex >= 0) {
                diagnostics.push(diagnostic('MODULE-SIBLING-ADMISSION-DENIED', `Sibling document declares module '${ref.id}' denied by host admission evidence.`, source));
            }
            else if (versionMismatchIndex >= 0) {
                diagnostics.push(diagnostic('MODULE-SIBLING-VERSION-MISMATCH', `Sibling document declares module '${ref.id}@${ref.version}' outside the admitted app module version.`, source));
            }
            else {
                diagnostics.push(diagnostic('MODULE-SIBLING-UNDECLARED', `Sibling document declares module '${ref.id}' outside the app module set.`, source));
            }
        }
        reports.push(report);
    }
    return { documents: reports, diagnostics };
}
function useSource(use) {
    return use.source;
}
function registryRef(record) {
    return {
        id: record.entry.name,
        version: record.entry.version ?? '',
    };
}
function ownerRef(record) {
    return registryRef(record);
}
function payloadSchemaFor(entry, validator) {
    if (validator === 'widgetShape.props') {
        return entry.widgetShape?.props;
    }
    return entry[validator];
}
function tokenSlotEvidenceFor(record, input) {
    const tokenSlots = record.entry.widgetShape?.tokenSlots;
    if (!Array.isArray(tokenSlots))
        return undefined;
    const evidence = tokenSlots.flatMap((slot, index) => {
        if (!slot || typeof slot !== 'object')
            return [];
        const candidate = slot;
        if (typeof candidate.name !== 'string')
            return [];
        if (!Array.isArray(candidate.acceptedTokenCategories))
            return [];
        if (!candidate.acceptedTokenCategories.every((category) => typeof category === 'string'))
            return [];
        if (candidate.acceptedTokenCategories.length === 0)
            return [];
        const acceptedTokenCategories = candidate.acceptedTokenCategories;
        return [{
                name: candidate.name,
                acceptedTokenCategories: [acceptedTokenCategories[0], ...acceptedTokenCategories.slice(1)],
                source: registrySource(record, input, `/entries/${record.entryIndex}/widgetShape/tokenSlots/${index}`),
            }];
    });
    return evidence.length > 0 ? evidence : undefined;
}
function tokenCategoryEvidenceFor(candidate, input, status) {
    return {
        prefix: candidate.prefix,
        status,
        entryName: candidate.record.entry.name,
        ...(candidate.record.entry.version ? { entryVersion: candidate.record.entry.version } : {}),
        owningModules: [ownerRef(candidate.owner)],
        source: registrySource(candidate.record, input, `/entries/${candidate.record.entryIndex}/categoryShape`),
    };
}
function tokenCategoryDiagnostic(record, input, reason, pointer = `/entries/${record.entryIndex}/categoryShape`, extraDetails = {}) {
    return diagnostic('MODULE-TOKEN-CATEGORY-SHAPE', `Token category contribution '${record.entry.name}' has invalid categoryShape evidence.`, registrySource(record, input, pointer), {
        details: {
            entryName: record.entry.name,
            reason,
            ...extraDetails,
        },
    });
}
function tokenCategoryShapeMismatch(record, owner, input, prefix) {
    return {
        prefix,
        status: 'shape-mismatch',
        entryName: record.entry.name,
        ...(record.entry.version ? { entryVersion: record.entry.version } : {}),
        owningModules: [ownerRef(owner)],
        source: registrySource(record, input, `/entries/${record.entryIndex}/categoryShape`),
    };
}
function tokenKeysForShape(shape) {
    const tokens = shape?.tokens;
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens))
        return undefined;
    return Object.keys(tokens);
}
function tokenCategoryRecordsForContribution(index, contributionName) {
    return (index.entriesByNameAll.get(contributionName) ?? [])
        .filter((record) => record.entry.category === 'token-category');
}
function normalizeTokenCategories(input, index, moduleStates) {
    const tokenCategories = [];
    const diagnostics = [];
    const validCandidatesByPrefix = new Map();
    for (const state of moduleStates.values()) {
        if (state.report.status !== 'admitted' || !state.registry)
            continue;
        const owner = state.registry;
        for (const contributionName of owner.entry.contributes ?? []) {
            for (const record of tokenCategoryRecordsForContribution(index, contributionName)) {
                const shape = record.entry.categoryShape;
                const rawPrefix = shape?.prefix;
                const prefix = typeof rawPrefix === 'string' ? rawPrefix : '<missing>';
                if (typeof rawPrefix !== 'string') {
                    tokenCategories.push(tokenCategoryShapeMismatch(record, owner, input, prefix));
                    diagnostics.push(tokenCategoryDiagnostic(record, input, 'missing-prefix', `/entries/${record.entryIndex}/categoryShape/prefix`));
                    continue;
                }
                if (!CUSTOM_TOKEN_CATEGORY_PREFIX_PATTERN.test(rawPrefix)) {
                    tokenCategories.push(tokenCategoryShapeMismatch(record, owner, input, rawPrefix));
                    diagnostics.push(tokenCategoryDiagnostic(record, input, 'invalid-prefix', `/entries/${record.entryIndex}/categoryShape/prefix`, { prefix: rawPrefix }));
                    continue;
                }
                const tokenKeys = tokenKeysForShape(shape);
                const invalidTokenKey = tokenKeys?.find((key) => !key.startsWith(`${rawPrefix}.`));
                if (!tokenKeys || tokenKeys.length === 0 || invalidTokenKey !== undefined) {
                    tokenCategories.push(tokenCategoryShapeMismatch(record, owner, input, rawPrefix));
                    diagnostics.push(tokenCategoryDiagnostic(record, input, invalidTokenKey !== undefined ? 'token-key-prefix-mismatch' : 'missing-tokens', `/entries/${record.entryIndex}/categoryShape/tokens`, { prefix: rawPrefix, ...(invalidTokenKey !== undefined ? { tokenKey: invalidTokenKey } : {}) }));
                    continue;
                }
                const candidates = validCandidatesByPrefix.get(rawPrefix) ?? [];
                candidates.push({ prefix: rawPrefix, record, owner });
                validCandidatesByPrefix.set(rawPrefix, candidates);
            }
        }
    }
    for (const [prefix, candidates] of validCandidatesByPrefix) {
        if (candidates.length === 1) {
            tokenCategories.push(tokenCategoryEvidenceFor(candidates[0], input, 'admitted'));
            continue;
        }
        const [primary, ...related] = candidates;
        tokenCategories.push({
            prefix,
            status: 'conflict',
            entryName: primary.record.entry.name,
            ...(primary.record.entry.version ? { entryVersion: primary.record.entry.version } : {}),
            owningModules: candidates.map((candidate) => ownerRef(candidate.owner)),
            source: registrySource(primary.record, input, `/entries/${primary.record.entryIndex}/categoryShape`),
        });
        diagnostics.push(diagnostic('MODULE-TOKEN-CATEGORY-CONFLICT', `More than one admitted token-category contribution claims prefix '${prefix}'.`, registrySource(primary.record, input, `/entries/${primary.record.entryIndex}/categoryShape/prefix`), {
            relatedSources: related.map((candidate) => registrySource(candidate.record, input, `/entries/${candidate.record.entryIndex}/categoryShape/prefix`)),
            details: {
                prefix,
                entries: candidates.map((candidate) => candidate.record.entry.name),
                owners: candidates.map((candidate) => candidate.owner.entry.name),
            },
        }));
    }
    tokenCategories.sort((left, right) => left.prefix.localeCompare(right.prefix)
        || (left.entryName ?? '').localeCompare(right.entryName ?? '')
        || left.status.localeCompare(right.status));
    return { tokenCategories, diagnostics };
}
function payloadValidatorName(use, entry, input) {
    if (use.payload === undefined)
        return undefined;
    if (use.payloadValidator)
        return use.payloadValidator;
    return input.support?.payloadSchemaValidators?.find((validator) => payloadSchemaFor(entry.entry, validator) !== undefined);
}
function payloadDiagnosticSource(use, fallback, path) {
    const source = use.payloadSource ?? fallback;
    if (!path)
        return source;
    const relativePointer = path.startsWith('#') ? path.slice(1) : path;
    return {
        ...source,
        jsonPointer: `${source.jsonPointer}${relativePointer.startsWith('/') ? '' : '/'}${relativePointer}`,
    };
}
function payloadSchemaPointer(validatorName) {
    return validatorName === WIDGET_SHAPE_PROPS_VALIDATOR
        ? '/widgetShape/props'
        : `/${escapeJsonPointerToken(validatorName)}`;
}
function payloadSchemaDiagnosticSource(entry, input, validatorName, result) {
    const base = `/entries/${entry.entryIndex}${payloadSchemaPointer(validatorName)}`;
    const resultPath = result.schemaFragmentPath
        ?? (result.schemaPath?.startsWith('#') ? result.schemaPath.slice(1) : result.schemaPath);
    if (!resultPath)
        return registrySource(entry, input, base);
    return registrySource(entry, input, `${base}${resultPath.startsWith('/') ? '' : '/'}${resultPath}`);
}
function resolvePayload(use, entry, source, input) {
    const validatorName = payloadValidatorName(use, entry, input);
    if (!validatorName)
        return { status: 'not-run' };
    const validate = input.support?.payloadValidators?.[validatorName];
    if (!validate)
        return { status: 'missing-validator' };
    let result;
    try {
        result = validate({
            payload: use.payload,
            schema: payloadSchemaFor(entry.entry, validatorName),
        });
    }
    catch (error) {
        result = {
            ok: false,
            reason: 'payload-validator-threw',
            message: error instanceof Error ? error.message : String(error),
        };
    }
    if (result.ok)
        return { status: 'passed' };
    const resultDetails = {
        contribution: use.name,
        validator: validatorName,
    };
    if (result.reason)
        resultDetails.reason = result.reason;
    if (result.keyword)
        resultDetails.keyword = result.keyword;
    if (result.message)
        resultDetails.message = result.message;
    if (result.schemaPath)
        resultDetails.schemaPath = result.schemaPath;
    return {
        status: 'failed',
        diagnostic: diagnostic('MODULE-PAYLOAD-SCHEMA-MISMATCH', `Payload for contribution '${use.name}' does not match ${validatorName}.`, payloadDiagnosticSource(use, source, result.path), {
            relatedSources: [payloadSchemaDiagnosticSource(entry, input, validatorName, result)],
            details: resultDetails,
        }),
    };
}
function resolveContributions(input, index, moduleStates) {
    const contributions = [];
    const diagnostics = [];
    for (const document of input.documents ?? []) {
        for (const use of document.uses ?? []) {
            const entry = index.entriesByName.get(use.name);
            const owners = index.contributedBy.get(use.name) ?? [];
            const expectedOwners = use.expectedOwnerModuleId
                ? owners.filter((owner) => owner.entry.name === use.expectedOwnerModuleId)
                : owners;
            const allAdmittedOwners = owners
                .filter((owner) => moduleStates.get(owner.entry.name)?.report.status === 'admitted');
            const admittedOwners = expectedOwners
                .filter((owner) => moduleStates.get(owner.entry.name)?.report.status === 'admitted');
            const source = useSource(use);
            const contribution = {
                site: use.site,
                name: use.name,
                expectedCategory: use.expectedCategory,
                status: 'resolved',
                payloadStatus: 'not-run',
                source,
            };
            if (!entry) {
                contribution.status = 'missing';
                diagnostics.push(diagnostic('MODULE-CONTRIBUTION-MISSING', `Contribution '${use.name}' is absent from the Registry entry index.`, source, { details: { contribution: use.name, expectedCategory: use.expectedCategory } }));
                contributions.push(contribution);
                continue;
            }
            contribution.registryCategory = entry.entry.category;
            contribution.entryVersion = entry.entry.version;
            if (entry.entry.category !== use.expectedCategory) {
                contribution.owningModules = owners.map(ownerRef);
                contribution.status = 'category-mismatch';
                diagnostics.push(diagnostic('MODULE-CONTRIBUTION-CATEGORY', `Contribution '${use.name}' is category '${entry.entry.category}', expected '${use.expectedCategory}'.`, source, {
                    relatedSources: [registrySource(entry, input)],
                    details: { registryCategory: entry.entry.category, expectedCategory: use.expectedCategory },
                }));
            }
            else if (owners.length === 0) {
                contribution.owningModules = [];
                contribution.status = 'unowned';
                diagnostics.push(diagnostic('MODULE-CONTRIBUTION-UNOWNED', `Contribution '${use.name}' is not contributed by any Registry module entry.`, registrySource(entry, input), { details: { contribution: use.name } }));
            }
            else if (allAdmittedOwners.length > 1) {
                contribution.owningModules = allAdmittedOwners.map(ownerRef);
                contribution.status = 'conflict';
                diagnostics.push(diagnostic('MODULE-CONTRIBUTION-CONFLICT', `Contribution '${use.name}' is claimed by more than one admitted module.`, registrySource(entry, input), { details: { contribution: use.name, owners: allAdmittedOwners.map((owner) => owner.entry.name) } }));
            }
            else if (expectedOwners.length === 0 && use.expectedOwnerModuleId) {
                contribution.owningModules = owners.map(ownerRef);
                contribution.status = 'owner-mismatch';
                diagnostics.push(diagnostic('MODULE-CONTRIBUTION-OWNER', `Contribution '${use.name}' is not contributed by expected module '${use.expectedOwnerModuleId}'.`, source, {
                    relatedSources: owners.map((owner) => ({
                        ...registrySource(owner, input),
                        module: ownerRef(owner),
                    })),
                    details: {
                        contribution: use.name,
                        expectedOwnerModuleId: use.expectedOwnerModuleId,
                        owningModules: owners.map((owner) => owner.entry.name),
                    },
                }));
            }
            else {
                const owner = admittedOwners[0] ?? expectedOwners[0];
                const ownerState = moduleStates.get(owner.entry.name);
                if (ownerState?.report.status !== 'admitted') {
                    contribution.owningModules = expectedOwners.map(ownerRef);
                    contribution.status = 'unadmitted';
                    diagnostics.push(diagnostic('MODULE-CONTRIBUTION-UNADMITTED', `Contribution '${use.name}' is owned by module '${owner.entry.name}', which is not in the admitted app module set.`, source, {
                        relatedSources: [{
                                ...registrySource(owner, input),
                                module: ownerRef(owner),
                            }],
                    }));
                }
                else {
                    contribution.owningModules = [ownerRef(owner)];
                    const payload = resolvePayload(use, entry, source, input);
                    contribution.payloadStatus = payload.status;
                    if (payload.status === 'failed' && payload.diagnostic) {
                        contribution.status = 'payload-schema-mismatch';
                        diagnostics.push(payload.diagnostic);
                    }
                    else if (entry.entry.category === 'widget') {
                        const tokenSlotEvidence = tokenSlotEvidenceFor(entry, input);
                        if (tokenSlotEvidence) {
                            contribution.widgetTokenSlots = tokenSlotEvidence;
                        }
                    }
                }
            }
            contributions.push(contribution);
        }
    }
    return { contributions, diagnostics };
}
function countDiagnostics(diagnostics, severity) {
    return diagnostics.filter((entry) => entry.severity === severity).length;
}
function supportForReport(support) {
    if (!support)
        return undefined;
    const report = {};
    if (support.defaultModules !== undefined)
        report.defaultModules = support.defaultModules.map(cloneRef);
    if (support.moduleCategories !== undefined)
        report.moduleCategories = [...support.moduleCategories];
    if (support.contributionCategories !== undefined)
        report.contributionCategories = [...support.contributionCategories];
    if (support.versionRangeGrammar !== undefined)
        report.versionRangeGrammar = support.versionRangeGrammar;
    if (support.payloadSchemaValidators !== undefined)
        report.payloadSchemaValidators = [...support.payloadSchemaValidators];
    return Object.keys(report).length > 0 ? report : undefined;
}
function summaryFor(modules, documents, contributions, diagnostics) {
    return {
        modules: modules.length,
        admittedModules: modules.filter((entry) => entry.status === 'admitted').length,
        deniedModules: modules.filter((entry) => entry.status === 'denied').length,
        documents: documents.length,
        contributions: contributions.length,
        unresolvedDependencies: diagnostics.filter((entry) => entry.code === 'MODULE-DEPENDENCY-UNRESOLVED').length,
        unresolvedContributions: contributions.filter((entry) => [
            'missing',
            'category-mismatch',
            'unowned',
            'conflict',
            'owner-mismatch',
            'unadmitted',
        ].includes(entry.status)).length,
        payloadFailures: contributions.filter((entry) => entry.status === 'payload-schema-mismatch').length,
        errors: countDiagnostics(diagnostics, 'error'),
        warnings: countDiagnostics(diagnostics, 'warning'),
        infos: countDiagnostics(diagnostics, 'info'),
    };
}
export function resolveModules(input) {
    const index = buildRegistryIndex(input.registries);
    const appModules = resolveAppModules(input, index);
    const documentResults = resolveDocuments(input.documents ?? [], appModules.states, input);
    const contributionResults = resolveContributions(input, index, appModules.states);
    const tokenCategoryResults = normalizeTokenCategories(input, index, appModules.states);
    const diagnostics = [
        ...appModules.diagnostics,
        ...documentResults.diagnostics,
        ...contributionResults.diagnostics,
        ...tokenCategoryResults.diagnostics,
    ];
    const support = supportForReport(input.support);
    return {
        ok: diagnostics.every((entry) => entry.severity !== 'error'),
        modules: appModules.modules,
        documents: documentResults.documents,
        contributions: contributionResults.contributions,
        ...(tokenCategoryResults.tokenCategories.length > 0 ? { tokenCategories: tokenCategoryResults.tokenCategories } : {}),
        diagnostics,
        summary: summaryFor(appModules.modules, documentResults.documents, contributionResults.contributions, diagnostics),
        phase: { phase: MODULE_PHASE, status: 'completed' },
        ...(support ? { support } : {}),
    };
}
