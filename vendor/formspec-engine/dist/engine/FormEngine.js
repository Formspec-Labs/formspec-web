/** @filedesc Reactive FormEngine: field signals, WASM-backed FEL evaluation, validation, and response assembly. */
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { validationResultIdentity } from '@formspec-org/types';
import { freezeSourceMetadata, readSourceResult, sourceErrorMessage } from './instance-source.js';
import { diffEvalResults } from '../diff.js';
import { FelExtensionFunctions } from '../extension-functions.js';
import { analyzeFEL, getFELDependencies, } from '../fel/fel-api-runtime.js';
import { preactReactiveRuntime } from '../reactivity/preact-runtime.js';
import { LocaleStore } from '../locale.js';
import { FetchIssuerFetcher } from '../issuer/IssuerFetcher.js';
import { IssuerStore } from '../issuer/IssuerStore.js';
import { createFieldViewModel, resolveItemHelpText, resolveItemLabel, } from '../field-view-model.js';
import { createFormViewModel } from '../form-view-model.js';
import { wasmCreateFelContext, wasmEvaluateDefinition, } from '../wasm-bridge-runtime.js';
import { resolveOptionSetsOnDefinition, validateCalculateBindCycles, validateVariableDefinitionCycles, } from './definition-setup.js';
import { captureDraftData } from './draft-snapshot.js';
import { validateInstanceDataAgainstSchema } from './instance-schema.js';
import { patchDeltaSignalsFromWasm, patchErrorSignalsFromWasm, patchValueSignalsFromWasm, } from './reactive-patches.js';
import { clearRepeatIndexedSubtree, snapshotRepeatRow, } from './repeat-ops.js';
import { buildFormspecResponseEnvelope, buildValidationReportEnvelope, collectRelevantValidationResults, collectTimedShapeValidationResults, migrateResponseData, resolvePinnedDefinition, } from './response-assembly.js';
import { mergeWasmEvalWithExternalValidations, wasmEvaluateDefinitionPayload, } from './wasm-fel.js';
import { felContextSchema, felContextSnapshot } from './fel-context.js';
import { appendPath, cloneValue, coerceFieldValue, coerceInitialValue, deepEqual, emptyValueForItem, extractInlineBind, getNestedValue, getScopeAncestors, isJsonRecord, isEmptyValue, makeValidationResult, normalizeRemoteOptions, parseInstanceTarget, resolveNowProvider, setNestedPathValue, splitIndexedPath, toBasePath, toValidationResult, } from './helpers.js';
import { collectSeedFromGroups, repeatHasHostData, resolvePrePopulateFromInstance, } from './instance-seeding.js';
import { DefaultValidationProfileResolver, } from '../validation/index.js';
export class FormEngine {
    constructor(definition, options = {}) {
        this.signals = {};
        this.relevantSignals = {};
        this.requiredSignals = {};
        this.readonlySignals = {};
        this.errorSignals = {};
        this.validationResults = {};
        /** Who last wrote each field (`'user'` by default, `'assist'` for Assist-driven writes); null until written. */
        this.writeSources = {};
        this.shapeResults = {};
        this.repeats = {};
        this.optionSignals = {};
        this.optionStateSignals = {};
        this.variableSignals = {};
        /** Own-key JSON data map; valid source names never inherit Object prototype values. */
        this.instanceData = Object.create(null);
        this._bindConfigs = {};
        this._fieldItems = new Map();
        /** `dataType` of every field Item by base path, from the definition (FEL value tagging, scope checks). */
        this._fieldDataTypes = {};
        /** WASM-resident FEL context for ad-hoc reads, reloaded when `key` (the engine's state epoch) changes. */
        this._felContext = null;
        this._groupItems = new Map();
        this._shapeTiming = new Map();
        this._displaySignalPaths = new Set();
        this._seedFromResolvedPaths = new Set();
        this._calculatedFields = new Set();
        this._registryEntries = new Map();
        /** Host FEL extension functions (Core §3.12), passed to every Rust evaluation. */
        this._extensionFunctions = new FelExtensionFunctions();
        this._registryDocuments = [];
        this._remoteOptionsTasks = [];
        this._instanceSourceAbort = new AbortController();
        this._pendingInstanceSources = new Set();
        this._sourceSeedPreservedFields = new Set();
        this._instanceSourceOutcomes = Object.create(null);
        this._disposed = false;
        this._instanceSourceTasks = [];
        this._variableSignalKeys = new Map();
        this._derivationTraceCache = new Map();
        this._externalValidation = [];
        this._fieldViewModels = {};
        this._itemLabelSignals = new Map();
        /** Hint / description signals for Items with no field view model, keyed `<property>:<instance path>`. */
        this._itemHelpTextSignals = new Map();
        this._data = {};
        this._previousEvalResult = null;
        this._fullResult = null;
        this._issuerResolutionEpoch = 0;
        this._resolvedIssuerEpoch = -1;
        this._runtimeContext = {
            nowProvider: () => new Date(),
        };
        const { runtimeContext, registryEntries, reactiveRuntime = preactReactiveRuntime, issuerFetcher, issuerOverride, extensionFunctions, } = options;
        this._instanceSourceResolver = options.instanceSourceResolver;
        this._responseSubject = cloneValue(options.responseSubject ?? undefined);
        this._rx = reactiveRuntime;
        this._issuerStore = new IssuerStore(issuerFetcher ?? new FetchIssuerFetcher());
        this._validationProfileResolver = new DefaultValidationProfileResolver();
        this._issuerOverride = issuerOverride;
        this.instanceVersion = this._rx.signal(0);
        this.structureVersion = this._rx.signal(0);
        this._evaluationVersion = this._rx.signal(0);
        this._labelContextSignal = this._rx.signal(null);
        this.definition = cloneValue(definition);
        if (options.draftSnapshot) {
            if (options.responseData)
                throw new Error('Supply draftSnapshot or responseData, not both');
            this.assertDraftSnapshot(options.draftSnapshot);
        }
        // Locale store — direction mode from formPresentation.direction or 'ltr'
        const directionMode = definition.formPresentation?.direction ?? 'ltr';
        this._localeStore = new LocaleStore(this._rx, directionMode, {
            kind: 'definition',
            url: definition.url,
        });
        this.localeSignal = this._localeStore.version;
        this._variableDefs = [...(this.definition.variables ?? [])];
        if (runtimeContext) {
            this.setRuntimeContext(runtimeContext);
        }
        for (const [name, registration] of Object.entries(extensionFunctions ?? {})) {
            this._extensionFunctions.register(name, registration);
        }
        if (registryEntries) {
            for (const entry of registryEntries) {
                if (entry?.name) {
                    this._registryEntries.set(entry.name, entry);
                }
            }
            this._registryDocuments = [{ entries: registryEntries }];
        }
        this._seedFromGroups = collectSeedFromGroups(this.definition.items);
        this.initializeOptionSignals();
        this.initializeInstances();
        this.initializeBindConfigs(this.definition.items);
        this.rejectInstancePathBinds();
        validateVariableDefinitionCycles(this._variableDefs, scope => this.variableScopePath(scope));
        validateCalculateBindCycles(this._bindConfigs);
        this.registerItems(this.definition.items);
        if (options.draftSnapshot) {
            this.loadItemsData(this.definition.items, options.draftSnapshot.data, '', true);
        }
        else if (options.responseData) {
            this.loadItemsData(this.definition.items, options.responseData, '');
        }
        this.runInstanceDependentSeeding();
        try {
            this._evaluate();
        }
        catch (error) {
            this.dispose();
            throw error;
        }
        this.initializeRemoteOptions();
        // Create form-level view model (after first evaluate so validation is available)
        this._formViewModel = createFormViewModel({
            rx: this._rx,
            localeStore: this._localeStore,
            getDefinitionTitle: () => this.definition.title ?? '',
            getDefinitionDescription: () => this.definition.description ?? '',
            getPageTitle: () => undefined,
            getPageDescription: () => undefined,
            interpolate: (template) => this._interpolate(template),
            getValidationCounts: () => {
                const report = this.getValidationReport();
                return {
                    errors: report.counts?.error ?? 0,
                    warnings: report.counts?.warning ?? 0,
                    infos: report.counts?.info ?? 0,
                };
            },
            getIsValid: () => this.getValidationReport().valid,
        });
    }
    static resolvePinnedDefinition(response, definitions) {
        return resolvePinnedDefinition(response, definitions);
    }
    get formPresentation() {
        return this.definition.formPresentation ?? null;
    }
    setRuntimeContext(context = {}) {
        if (Object.prototype.hasOwnProperty.call(context, 'now')) {
            this._runtimeContext.nowProvider = resolveNowProvider(context.now);
        }
        if (Object.prototype.hasOwnProperty.call(context, 'locale') && context.locale) {
            this._runtimeContext.locale = context.locale;
            this._localeStore.setLocale(context.locale);
        }
        if (Object.prototype.hasOwnProperty.call(context, 'timeZone')) {
            this._runtimeContext.timeZone = context.timeZone;
        }
        if (Object.prototype.hasOwnProperty.call(context, 'seed')) {
            this._runtimeContext.seed = context.seed;
        }
        if (Object.prototype.hasOwnProperty.call(context, 'meta')) {
            this._runtimeContext.meta = context.meta;
        }
        if (this._fullResult) {
            this._evaluate();
        }
    }
    setIssuerOverride(source) {
        this._issuerResolutionEpoch += 1;
        this._issuerOverride = source;
        this._resolvedIssuer = undefined;
        this._resolvedIssuerEpoch = -1;
        this._issuerResolutionPromise = undefined;
    }
    async getResolvedIssuer() {
        if (!this._issuerResolutionPromise) {
            const epoch = this._issuerResolutionEpoch;
            let promise;
            promise = this._issuerStore.resolve({
                definitionIssuer: definitionIssuerSource(this.definition),
                hostOverride: this._issuerOverride,
            }).then((resolved) => {
                if (this._issuerResolutionEpoch === epoch && this._issuerResolutionPromise === promise) {
                    this._resolvedIssuer = resolved;
                    this._resolvedIssuerEpoch = epoch;
                }
                return resolved;
            });
            this._issuerResolutionPromise = promise;
        }
        return this._issuerResolutionPromise;
    }
    getOptions(path) {
        return this.optionSignals[toBasePath(path)]?.value ?? [];
    }
    getOptionsSignal(path) {
        return this.optionSignals[toBasePath(path)];
    }
    getOptionsState(path) {
        return this.optionStateSignals[toBasePath(path)]?.value ?? { loading: false, error: null };
    }
    getOptionsStateSignal(path) {
        return this.optionStateSignals[toBasePath(path)];
    }
    async waitForRemoteOptions() {
        await Promise.allSettled(this._remoteOptionsTasks);
    }
    async waitForInstanceSources() {
        await Promise.allSettled(this._instanceSourceTasks);
        return freezeSourceMetadata(cloneValue(this._instanceSourceOutcomes));
    }
    setInstanceValue(name, path, value) {
        this.writeInstanceValue(name, path, value);
        this._evaluate();
    }
    getInstanceData(name, path) {
        const data = this.instanceData[name];
        if (data === undefined) {
            return undefined;
        }
        if (!path) {
            return data;
        }
        return isJsonRecord(data) ? getNestedValue(data, path) : undefined;
    }
    getDisabledDisplay(path) {
        return this._bindConfigs[toBasePath(path)]?.disabledDisplay ?? 'hidden';
    }
    getVariableValue(name, scopePath) {
        this._evaluationVersion.value;
        const scopes = this._fullResult?.scopedVariables ?? {};
        const path = scopePath.split('.');
        const prefixes = path.map((_, index) => path.slice(0, index + 1).join('.'));
        if (!['#', ...prefixes].some(scope => Object.prototype.hasOwnProperty.call(scopes[scope] ?? {}, name))) {
            return undefined;
        }
        return this.compileExpression(`@${name}`, scopePath)();
    }
    /** Appends a row and returns its index; `undefined` when the path is not repeatable or already at `maxRepeat` (Core §4.2.2). */
    addRepeatInstance(itemName) {
        const path = this.resolveRepeatPath(itemName);
        const item = this._groupItems.get(path);
        if (!item?.repeatable) {
            return undefined;
        }
        const index = this.repeats[path]?.value ?? 0;
        if (item.maxRepeat !== undefined && index >= item.maxRepeat) {
            return undefined;
        }
        this.appendRepeatRow(path, item);
        if (item.seedFrom && this._pendingInstanceSources.has(item.seedFrom.instance)) {
            this._seedFromResolvedPaths.add(path);
        }
        this._evaluate();
        return index;
    }
    removeRepeatInstance(itemName, index) {
        const path = this.resolveRepeatPath(itemName);
        const item = this._groupItems.get(path);
        const count = this.repeats[path]?.value ?? 0;
        if (!item?.repeatable || index < 0 || index >= count) {
            return;
        }
        this.rebuildRepeatRows(path, item, index);
        if (item.seedFrom && this._pendingInstanceSources.has(item.seedFrom.instance)) {
            this._seedFromResolvedPaths.add(path);
        }
        this._evaluate();
    }
    /**
     * Loads a Response `data` tree with one evaluation. Definition-directed: a repeatable group present in
     * `data` gets exactly one row per array entry, past `maxRepeat` or below `minRepeat` included, so loaded
     * data reports MAX_REPEAT / MIN_REPEAT instead of losing rows. Keys absent from `data` keep their state;
     * calculated fields and undeclared keys are ignored.
     */
    loadResponseData(data) {
        this.loadItemsData(this.definition.items, data, '');
        this._evaluate();
    }
    getDraftSnapshot() {
        const data = captureDraftData(this.definition.items, path => !this._calculatedFields.has(toBasePath(path)) && Object.prototype.hasOwnProperty.call(this._data, path)
            ? this._data[path] : undefined, path => this.repeats[path].value);
        return cloneValue({
            definitionUrl: this.definition.url,
            definitionVersion: this.definition.version,
            data,
        });
    }
    loadDraftSnapshot(snapshot) {
        this.assertDraftSnapshot(snapshot);
        this._rx.batch(() => {
            this.loadItemsData(this.definition.items, snapshot.data, '', true);
            // Restoring a draft starts a new evaluation history. Keep the prior result for the signal diff.
            this._evaluate(null);
        });
    }
    assertDraftSnapshot(snapshot) {
        if (snapshot.definitionUrl !== this.definition.url || snapshot.definitionVersion !== this.definition.version) {
            throw new Error('Draft Definition pin does not match the form Definition');
        }
        if (!isJsonRecord(snapshot.data))
            throw new TypeError('Draft data must be a JSON object');
    }
    loadItemsData(items, data, prefix, draft = false) {
        for (const item of items) {
            const present = Object.prototype.hasOwnProperty.call(data, item.key);
            if (!present && !draft)
                continue;
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const value = present ? data[item.key] : undefined;
            if (item.type === 'field') {
                if (draft || this._pendingInstanceSources.size > 0)
                    this._sourceSeedPreservedFields.add(path);
                if (draft) {
                    if (!this._calculatedFields.has(toBasePath(path)))
                        this.storeFieldValue(path, value);
                    this.writeSources[path].value = null;
                    this.loadItemsData(item.children ?? [], data, path, true);
                }
                else {
                    this.writeFieldData(path, value);
                }
            }
            else if (item.type === 'group' && item.repeatable && this.repeats[path]) {
                this._seedFromResolvedPaths.add(path);
                const rows = Array.isArray(value) ? value : [];
                if (this.repeats[path].value > rows.length) {
                    this._rx.batch(() => {
                        this.clearRepeatSubtree(path, rows.length);
                        this.repeats[path].value = rows.length;
                        this.structureVersion.value += 1;
                    });
                }
                while (this.repeats[path].value < rows.length) {
                    this.appendRepeatRow(path, item);
                }
                rows.forEach((row, index) => {
                    if (isJsonRecord(row)) {
                        this.loadItemsData(item.children ?? [], row, `${path}[${index}]`, draft);
                    }
                });
            }
            else if (item.type === 'group' && !item.repeatable && (draft || isJsonRecord(value))) {
                this.loadItemsData(item.children ?? [], isJsonRecord(value) ? value : {}, path, draft);
            }
        }
    }
    appendRepeatRow(path, item) {
        const index = this.repeats[path].value;
        this._rx.batch(() => {
            this.repeats[path].value = index + 1;
            this.registerItemChildren(item.children ?? [], `${path}[${index}]`);
            this.structureVersion.value += 1;
        });
    }
    /** Reindex the surviving rows with their nested shape, values and prefill protection. */
    rebuildRepeatRows(path, item, removedIndex) {
        const children = item.children ?? [];
        const rows = [];
        for (let current = 0; current < this.repeats[path].value; current += 1) {
            if (current === removedIndex)
                continue;
            rows.push(snapshotRepeatRow(children, `${path}[${current}]`, fieldPath => ({
                value: cloneValue(this.signals[fieldPath]?.value),
                writeSource: this.writeSources[fieldPath]?.value ?? null,
                preserveSourceSeed: this._sourceSeedPreservedFields.has(fieldPath),
            }), repeatPath => this.repeats[repeatPath]?.value ?? 0));
        }
        this._rx.batch(() => {
            this.clearRepeatSubtree(path);
            this.repeats[path].value = rows.length;
            for (const [index, row] of rows.entries()) {
                const rowPath = `${path}[${index}]`;
                this.registerItemChildren(children, rowPath);
                for (const { path: relativePath, item: repeatItem, count } of row.repeats) {
                    const repeatPath = `${rowPath}.${relativePath}`;
                    this.clearRepeatSubtree(repeatPath);
                    this.repeats[repeatPath].value = count;
                    for (let nested = 0; nested < count; nested += 1) {
                        this.registerItemChildren(repeatItem.children ?? [], `${repeatPath}[${nested}]`);
                    }
                }
                for (const { path: relativePath, value, writeSource, preserveSourceSeed } of row.fields) {
                    const fieldPath = `${rowPath}.${relativePath}`;
                    this._data[fieldPath] = value;
                    this.signals[fieldPath].value = value;
                    this.writeSources[fieldPath].value = writeSource;
                    if (preserveSourceSeed)
                        this._sourceSeedPreservedFields.add(fieldPath);
                }
            }
            // The rebuilt signals need their evaluated state even when it matches the old index.
            const previous = this._previousEvalResult;
            if (previous) {
                const prefix = `${path}[`;
                // The evaluator pads phantom rows below minRepeat (fs-i731). Keep their prior state.
                const keepPath = (fieldPath) => !(fieldPath.startsWith(prefix) && Object.prototype.hasOwnProperty.call(this.requiredSignals, fieldPath));
                const keepFlags = (flags) => Object.fromEntries(Object.entries(flags).filter(([fieldPath]) => keepPath(fieldPath)));
                this._previousEvalResult = {
                    ...previous,
                    nonRelevant: previous.nonRelevant.filter(keepPath),
                    required: keepFlags(previous.required),
                    readonly: keepFlags(previous.readonly),
                    validations: previous.validations.filter(({ path: resultPath, shapeId }) => shapeId || keepPath(resultPath)),
                };
            }
            this.structureVersion.value += 1;
        });
    }
    compileExpression(expression, currentItemName = '') {
        return () => {
            this._evaluationVersion.value;
            this.instanceVersion.value;
            this.structureVersion.value;
            // compileExpression is a public API — propagate errors (unlike internal evaluation).
            return parseJsonExact(this.felContext().evaluate(expression, currentItemName, true, this.nowISO(), this._extensionFunctions)).value;
        };
    }
    setValue(name, value, options = {}) {
        var _a;
        if (typeof name !== 'string') {
            throw new TypeError('setValue path cannot be null');
        }
        const basePath = toBasePath(name);
        const instanceTarget = this.instanceTargetUnlessItem(name, basePath);
        if (instanceTarget) {
            this.writeInstanceValue(instanceTarget.instanceName, instanceTarget.instancePath, value);
            this._evaluate();
            return;
        }
        if (this.writeFieldData(name, value, basePath)) {
            ((_a = this.writeSources)[name] ?? (_a[name] = this._rx.signal(null))).value = options.source ?? 'user';
            this._evaluate();
        }
    }
    /** Coerces and stores a field value without evaluating; false for calculated or undeclared fields. */
    writeFieldData(name, value, basePath = toBasePath(name)) {
        if (this._calculatedFields.has(basePath)) {
            return false;
        }
        const item = this._fieldItems.get(basePath);
        if (!item) {
            return false;
        }
        const bind = this._bindConfigs[basePath];
        this.storeFieldValue(name, coerceFieldValue(item, bind, this.definition, value));
        return true;
    }
    storeFieldValue(path, value) {
        if (value === undefined) {
            delete this._data[path];
        }
        else {
            this._data[path] = cloneValue(value);
        }
    }
    getValidationReport(options = { profile: 'live' }) {
        this.assertValidationReportOptions(options, 'getValidationReport');
        const profile = options.profile ?? 'live';
        const trigger = this._validationProfileResolver.resolve(profile);
        if (trigger === 'disabled') {
            return null;
        }
        return this.produceValidation(trigger).report;
    }
    /** Report for `trigger` plus the expression diagnostics of the evaluation that produced it. */
    produceValidation(trigger) {
        const results = [];
        let diagnostics = this._fullResult?.diagnostics ?? [];
        const timestamp = this.nowISO();
        if (trigger === 'demand') {
            const demandResult = this.evaluateResultForTrigger('demand', timestamp);
            diagnostics = demandResult.diagnostics;
            results.push(...collectTimedShapeValidationResults(demandResult, this._shapeTiming, 'demand'));
        }
        else {
            for (const [path, signalRef] of Object.entries(this.validationResults)) {
                if (this.isPathRelevant(path)) {
                    results.push(...signalRef.value);
                }
            }
            for (const signalRef of Object.values(this.shapeResults)) {
                results.push(...signalRef.value);
            }
            if (trigger === 'submit' && this.hasSubmitValidation()) {
                const submitResult = this.evaluateResultForTrigger('submit', timestamp);
                diagnostics = submitResult.diagnostics;
                const seen = new Set(results.map(validationResultIdentity));
                for (const result of collectRelevantValidationResults(submitResult)) {
                    const identity = validationResultIdentity(result);
                    if (seen.has(identity))
                        continue;
                    seen.add(identity);
                    results.push(result);
                }
            }
        }
        return {
            report: buildValidationReportEnvelope(results, timestamp, this.definition.url, this.definition.version),
            diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
        };
    }
    hasSubmitValidation() {
        const { warningExplanation, shapes } = this.definition;
        if (warningExplanation && warningExplanation !== 'none') {
            return true;
        }
        return shapes?.some(({ timing, explanation }) => timing === 'submit'
            || (explanation && explanation !== 'none')) ?? false;
    }
    evaluateShape(shapeId) {
        const timing = this._shapeTiming.get(shapeId) ?? 'continuous';
        if (timing === 'demand') {
            return this.evaluateResultForTrigger('demand').validations
                .filter((result) => result.shapeId === shapeId)
                .map(toValidationResult);
        }
        if (!this._fullResult) {
            this._evaluate();
        }
        return this._fullResult?.validations
            .filter((result) => result.shapeId === shapeId)
            .map(toValidationResult) ?? [];
    }
    isPathRelevant(path) {
        if (!path) {
            return true;
        }
        const segments = splitIndexedPath(path);
        let current = '';
        for (const segment of segments) {
            current = current ? appendPath(current, segment) : segment;
            if (this.relevantSignals[current] && !this.relevantSignals[current].value) {
                return false;
            }
        }
        return true;
    }
    whyRelevant(path) {
        const basePath = toBasePath(path);
        const bindPath = this.findGoverningRelevanceBindPath(basePath);
        if (!bindPath) {
            return {
                bindId: null,
                expression: null,
                dependsOn: [],
                evaluatedAs: this.isPathRelevant(path),
            };
        }
        const expression = this._bindConfigs[bindPath]?.relevant ?? null;
        return {
            bindId: bindPath,
            expression,
            dependsOn: expression ? this.expressionDependencies(expression, bindPath) : [],
            evaluatedAs: this.relevantSignals[bindPath]?.value ?? this.isPathRelevant(bindPath),
        };
    }
    getDerivationTree(path) {
        const basePath = toBasePath(path);
        const calculate = this._bindConfigs[basePath]?.calculate;
        if (!calculate) {
            return [];
        }
        const version = this._evaluationVersion.value;
        const cached = this._derivationTraceCache.get(path);
        if (cached && cached.version === version) {
            return cached.trace.map((step) => cloneValue(step));
        }
        try {
            const result = parseJsonExact(this.felContext().evaluateTrace(calculate, path, true, this.nowISO(), this._extensionFunctions));
            const trace = Array.isArray(result.trace) ? result.trace : [];
            this._derivationTraceCache.set(path, {
                version,
                trace: trace.map((step) => cloneValue(step)),
            });
            return trace.map((step) => cloneValue(step));
        }
        catch {
            return [];
        }
    }
    getDownstreamImpact(path) {
        const source = toBasePath(path);
        const edges = this.downstreamDependencyEdges();
        const impacted = new Set();
        const queue = [source];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const [dependency, targets] of edges.entries()) {
                if (!FormEngine.pathDependencyMatches(current, dependency)) {
                    continue;
                }
                for (const target of targets) {
                    if (target === source || impacted.has(target)) {
                        continue;
                    }
                    impacted.add(target);
                    queue.push(target);
                }
            }
        }
        return [...impacted].sort();
    }
    getFieldPaths() {
        return Object.keys(this._fieldViewModels).sort();
    }
    /** Read the current field flags and the requested validation profile, which defaults to live. */
    getEvaluatedFormState(options = {}) {
        // A repeat can add or remove the only field signals between evaluations.
        this._evaluationVersion.value;
        const fields = Object.keys(this._fieldViewModels).map(path => ({
            path,
            relevant: this.isPathRelevant(path),
            readonly: this.readonlySignals[path]?.value ?? false,
            required: this.requiredSignals[path]?.value ?? false,
            empty: isEmptyValue(this.signals[path]?.value),
        }));
        return { fields, report: this.getValidationReport(options) };
    }
    getResponse(meta) {
        return this.getResponseSnapshot(meta).response;
    }
    /** One evaluation and clock for response data and its requested validation report. */
    getResponseSnapshot(meta, validationProfile) {
        this.assertNoRemovedModeOption(meta, 'getResponse');
        if (meta?.subject && (this._responseSubject || 'keys' in meta.subject)) {
            throw new Error('Supply filing-unit identity through the responseSubject constructor option');
        }
        const profile = meta?.profile ?? 'live';
        const responseTrigger = this._validationProfileResolver.resolve(profile);
        const trigger = this._validationProfileResolver.resolve(validationProfile ?? profile);
        const timestamp = this.nowISO();
        const result = this.evaluateResultForTrigger(trigger, timestamp);
        const data = cloneValue(result.data);
        const report = trigger === 'disabled' ? null : buildValidationReportEnvelope((trigger === 'demand'
            ? collectTimedShapeValidationResults(result, this._shapeTiming, 'demand')
            : collectRelevantValidationResults(result)), timestamp, this.definition.url, this.definition.version);
        const response = buildFormspecResponseEnvelope({
            definition: this.definition,
            data,
            report: responseTrigger === 'disabled' ? null : report,
            completionEligible: responseTrigger === 'submit' && trigger === 'submit',
            timestamp,
            displayedIssuer: this.getDisplayedIssuerPin(),
            displayedLocale: this.getDisplayedLocalePin(),
            subject: cloneValue(this._responseSubject ?? meta?.subject),
            meta,
        });
        return { response, validationReport: report };
    }
    getDiagnosticsSnapshot(options = { profile: 'live' }) {
        this.assertValidationReportOptions(options, 'getDiagnosticsSnapshot');
        const trigger = this._validationProfileResolver.resolve(options.profile ?? 'live');
        const validation = trigger === 'disabled'
            ? { report: null, diagnostics: (this._fullResult?.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic })) }
            : this.produceValidation(trigger);
        const values = {};
        const mips = {};
        const repeats = {};
        for (const [path, repeatSignal] of Object.entries(this.repeats)) {
            repeats[path] = repeatSignal.value;
        }
        for (const [path, signalRef] of Object.entries(this.signals)) {
            values[path] = (cloneValue(signalRef.value) ?? null);
            mips[path] = {
                relevant: this.relevantSignals[path]?.value ?? true,
                required: this.requiredSignals[path]?.value ?? false,
                readonly: this.readonlySignals[path]?.value ?? false,
                error: this.errorSignals[path]?.value ?? null,
            };
        }
        const timestamp = this.nowISO();
        return {
            definition: {
                url: this.definition.url,
                version: this.definition.version,
                title: this.definition.title,
            },
            timestamp,
            structureVersion: this.structureVersion.value,
            repeats,
            values,
            mips,
            validation: validation.report,
            evaluationDiagnostics: validation.diagnostics,
            runtimeContext: {
                now: timestamp,
                locale: this._runtimeContext.locale,
                timeZone: this._runtimeContext.timeZone,
                seed: this._runtimeContext.seed,
            },
        };
    }
    applyReplayEvent(event) {
        try {
            switch (event.type) {
                case 'setValue':
                    this.setValue(event.path, event.value);
                    return { ok: true, event };
                case 'addRepeatInstance':
                    return { ok: true, event, output: this.addRepeatInstance(event.path) };
                case 'removeRepeatInstance':
                    this.removeRepeatInstance(event.path, event.index);
                    return { ok: true, event };
                case 'evaluateShape':
                    return { ok: true, event, output: this.evaluateShape(event.shapeId) };
                case 'getValidationReport':
                    this.assertNoRemovedModeOption(event, 'getValidationReport replay event');
                    return { ok: true, event, output: this.getValidationReport({ profile: event.profile }) };
                case 'getResponse':
                    this.assertNoRemovedModeOption(event, 'getResponse replay event');
                    return { ok: true, event, output: this.getResponse({ profile: event.profile }) };
                default: {
                    return assertNeverReplayEvent(event);
                }
            }
        }
        catch (error) {
            return {
                ok: false,
                event,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    replay(events, options) {
        const results = [];
        const errors = [];
        let applied = 0;
        for (let index = 0; index < events.length; index += 1) {
            const result = this.applyReplayEvent(events[index]);
            results.push(result);
            if (result.ok) {
                applied += 1;
                continue;
            }
            errors.push({
                index,
                event: events[index],
                error: result.error ?? 'Unknown replay error',
            });
            if (options?.stopOnError) {
                break;
            }
        }
        return { applied, results, errors };
    }
    getDefinition() {
        return this.definition;
    }
    setLabelContext(context) {
        this._labelContextSignal.value = context;
    }
    /** Definition label for the active label context (no Locale, no `{{}}`); reactive to `setLabelContext`. */
    getLabel(item) {
        const context = this._labelContextSignal.value;
        if (context && item.labels?.[context]) {
            return item.labels[context];
        }
        return item.label;
    }
    /**
     * Reactive label a respondent sees for the Item at instance `path` — field, display, or group (a repeat row
     * path such as `jobs[0]` names its group). Same cascade as `FieldViewModel.label` (Locale
     * `<key>.label@context` → `<key>.label` → `labels[context]` → inline), `{{}}` interpolated in the Item's
     * scope. `undefined` when no Item has that path.
     */
    getItemLabelSignal(path) {
        const fieldVM = this._fieldViewModels[path];
        if (fieldVM) {
            return fieldVM.label;
        }
        const cached = this._itemLabelSignals.get(path);
        if (cached) {
            return cached;
        }
        const item = path ? this._groupItems.get(path) ?? this._groupItems.get(toBasePath(path)) : undefined;
        if (!item) {
            return undefined;
        }
        const label = this._rx.computed(() => resolveItemLabel({
            localeStore: this._localeStore,
            itemKey: item.key,
            inlineLabel: item.label,
            labels: item.labels,
            context: this._labelContextSignal.value,
            interpolate: (template) => this._interpolate(template, path),
        }).value);
        this._itemLabelSignals.set(path, label);
        return label;
    }
    /**
     * Reactive hint a respondent sees for the Item at instance `path` — field, display, or group. Same
     * cascade as `FieldViewModel.hint` (Locale `<key>.hint@context` → `<key>.hint` → inline `hint`; no
     * Definition-side context step), `{{}}` interpolated in the Item's scope. `null` when no source has
     * one; `undefined` when no Item has that path.
     */
    getItemHintSignal(path) {
        return this.itemHelpTextSignal(path, 'hint');
    }
    /** {@link FormEngine.getItemHintSignal} for the Item's `description`. */
    getItemDescriptionSignal(path) {
        return this.itemHelpTextSignal(path, 'description');
    }
    itemHelpTextSignal(path, property) {
        const fieldVM = this._fieldViewModels[path];
        if (fieldVM) {
            return property === 'hint' ? fieldVM.hint : fieldVM.description;
        }
        const key = `${property}:${path}`;
        const cached = this._itemHelpTextSignals.get(key);
        if (cached) {
            return cached;
        }
        const item = path ? this._groupItems.get(path) ?? this._groupItems.get(toBasePath(path)) : undefined;
        if (!item) {
            return undefined;
        }
        const resolved = this._rx.computed(() => resolveItemHelpText({
            localeStore: this._localeStore,
            itemKey: item.key,
            property,
            inlineText: item[property],
            context: this._labelContextSignal.value,
            interpolate: (template) => this._interpolate(template, path),
        }).value);
        this._itemHelpTextSignals.set(key, resolved);
        return resolved;
    }
    loadLocale(doc) {
        this._localeStore.loadLocale(doc);
    }
    setLocale(code) {
        this._localeStore.setLocale(code);
    }
    getActiveLocale() {
        return this._localeStore.activeLocale.value;
    }
    getAvailableLocales() {
        return this._localeStore.getAvailableLocales();
    }
    getLocaleDirection() {
        return this._localeStore.direction.value;
    }
    getFieldVM(path) {
        return this._fieldViewModels[path];
    }
    resolveValidationMessage(result) {
        return this._fieldViewModels[result.path]?.resolveMessage(result) ?? result.message;
    }
    getFormVM() {
        return this._formViewModel;
    }
    resolveLocaleString(key, fallback, itemPath = '') {
        const localized = this._localeStore.lookupKey(key);
        if (localized !== null) {
            return this._interpolate(localized, itemPath);
        }
        return fallback;
    }
    /**
     * Raw Locale string for `key`, or `null` when no loaded document (through the fallback cascade, §4)
     * carries it. Unlike {@link resolveLocaleString}, this never runs `{{}}` through FEL — for chrome
     * strings (Locale §3.1.10 `$ui.<ChromeStringKey>`), whose `{{$param}}` placeholders are renderer-
     * supplied literals (`$label`, `$index`, ...), not form-scope FEL.
     */
    lookupLocaleString(key) {
        return this._localeStore.lookupKey(key);
    }
    injectExternalValidation(results) {
        this._externalValidation.splice(0, this._externalValidation.length, ...results.map((result) => makeValidationResult({
            path: result.path,
            severity: result.severity,
            constraintKind: 'constraint',
            code: result.code,
            message: result.message,
            source: (result.source ?? 'external'),
        })));
        this._evaluate();
    }
    clearExternalValidation(path) {
        if (!path) {
            this._externalValidation.splice(0, this._externalValidation.length);
        }
        else {
            const base = toBasePath(path);
            for (let index = this._externalValidation.length - 1; index >= 0; index -= 1) {
                if (toBasePath(this._externalValidation[index].path) === base) {
                    this._externalValidation.splice(index, 1);
                }
            }
        }
        this._evaluate();
    }
    dispose() {
        this._disposed = true;
        this._instanceSourceAbort.abort();
        // The only owned WASM allocation is the resident FEL context; signals need no teardown.
        this._felContext?.handle.free();
        this._felContext = null;
    }
    registerExtensionFunction(name, registration) {
        this._extensionFunctions.register(name, registration);
        this._evaluate();
    }
    setRegistryEntries(entries) {
        this._registryEntries.clear();
        for (const entry of entries) {
            if (entry?.name) {
                this._registryEntries.set(entry.name, entry);
            }
        }
        this._registryDocuments = [{ entries }];
        this._evaluate();
    }
    migrateResponse(responseData, fromVersion) {
        return migrateResponseData(this.definition, responseData, fromVersion, {
            nowIso: this.nowISO(),
        });
    }
    nowISO() {
        return this._runtimeContext.nowProvider().toISOString();
    }
    initializeOptionSignals() {
        const visit = (items, prefix = '') => {
            for (const item of items) {
                const path = prefix ? `${prefix}.${item.key}` : item.key;
                if (item.type === 'field') {
                    const options = Array.isArray(item.options)
                        ? item.options.map((option) => {
                            const base = {
                                value: String(option.value),
                                label: String(option.label),
                                ...(option['x-generation']
                                    ? { 'x-generation': option['x-generation'] }
                                    : {}),
                            };
                            if (Array.isArray(option.keywords) && option.keywords.length > 0) {
                                const keywords = option.keywords
                                    .map((k) => String(k))
                                    .filter((s) => s.length > 0);
                                if (keywords.length > 0)
                                    return { ...base, keywords };
                            }
                            return base;
                        })
                        : [];
                    this.optionSignals[path] = this._rx.signal(options);
                    this.optionStateSignals[path] = this._rx.signal({ loading: false, error: null });
                }
                if (item.children) {
                    visit(item.children, path);
                }
            }
        };
        // Resolve a display-only copy; evaluation always receives the authored Definition.
        visit(resolveOptionSetsOnDefinition(this.definition).items);
    }
    initializeInstances() {
        const instances = this.definition.instances;
        if (!instances) {
            return;
        }
        for (const [name, instance] of Object.entries(instances)) {
            if (instance.data !== undefined) {
                const seedData = cloneValue(instance.data);
                this.validateInstanceSchema(name, seedData);
                this.instanceData[name] = seedData;
            }
            this.initializeInstanceSource(name, instance);
        }
    }
    /**
     * The HTTP(S) URL an instance `source` names, or null when it names something the engine does not fetch —
     * a host-provided scheme such as `formspec-fn:`, or a relative reference with no page to resolve it.
     * On a page, a relative reference resolves against `document.baseURI` like any other relative reference,
     * so `./data/claimant.json` beside a Definition works under whatever path the site is served from.
     * Elsewhere (a server, a test) an absolute URL or a root path is passed through as written.
     */
    static resolveInstanceSource(source) {
        const base = typeof document !== 'undefined' ? document.baseURI : undefined;
        if (base) {
            try {
                const url = new URL(source, base);
                return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
            }
            catch {
                return null;
            }
        }
        return /^https?:\/\//i.test(source) || source.startsWith('/') ? source : null;
    }
    initializeInstanceSource(name, instance) {
        if (!instance.source)
            return;
        const resolver = this._instanceSourceResolver;
        const source = resolver ? instance.source : FormEngine.resolveInstanceSource(instance.source);
        if (!source) {
            this._instanceSourceOutcomes[name] = { status: 'unavailable', reason: 'Unsupported source' };
            return;
        }
        if (!resolver && instance.static && FormEngine.instanceSourceCache.has(source)) {
            try {
                const cached = FormEngine.instanceSourceCache.get(source);
                this.validateInstanceSchema(name, cached);
                this.instanceData[name] = cloneValue(cached);
                this._instanceSourceOutcomes[name] = { status: 'loaded' };
            }
            catch (error) {
                this._instanceSourceOutcomes[name] = { status: 'unavailable', reason: sourceErrorMessage(error) };
            }
            return;
        }
        // Only host-loaded sources defer fallback-dependent creation-time seeding.
        if (resolver)
            this._pendingInstanceSources.add(name);
        const signal = this._instanceSourceAbort.signal;
        const request = freezeSourceMetadata(cloneValue({
            instanceName: name, source: instance.source,
            definition: { url: this.definition.url, version: this.definition.version },
            ...(instance.schema ? { schema: instance.schema } : {}),
            static: instance.static === true, readonly: instance.readonly !== false,
        }));
        const task = new Promise((settle) => {
            const abort = () => {
                this._instanceSourceOutcomes[name] = { status: 'aborted' };
                this._pendingInstanceSources.delete(name);
                settle();
            };
            signal.addEventListener('abort', abort, { once: true });
            let installed = false;
            let previous;
            let hadPrevious = false;
            Promise.resolve().then(async () => {
                if (signal.aborted)
                    return;
                let payload;
                if (resolver) {
                    const result = readSourceResult(await resolver(request, Object.freeze({ signal })));
                    if (this._disposed)
                        return;
                    if (result.status === 'unavailable') {
                        this._instanceSourceOutcomes[name] = result;
                        return;
                    }
                    payload = result.value;
                    if (instance.schema && !isJsonRecord(payload)) {
                        throw new Error(`Instance '${name}' schema requires an object`);
                    }
                }
                else {
                    const response = await fetch(source, { signal });
                    if (!response.ok)
                        throw new Error(`Instance source fetch failed (${response.status})`);
                    payload = parseJsonExact(await response.text());
                }
                if (this._disposed)
                    return;
                this.validateInstanceSchema(name, payload);
                const nextValue = cloneValue(payload);
                hadPrevious = Object.prototype.hasOwnProperty.call(this.instanceData, name);
                previous = this.instanceData[name];
                Object.defineProperty(this.instanceData, name, { value: nextValue, enumerable: true, writable: true, configurable: true });
                installed = true;
                this.instanceVersion.value += 1;
            }).catch((error) => {
                if (this._disposed)
                    return;
                this._instanceSourceOutcomes[name] = { status: 'unavailable', reason: sourceErrorMessage(error) };
                try {
                    console.error(`Failed to load instance source '${name}':`, error);
                }
                catch { /* Diagnostics must not prevent settlement. */ }
            }).then(() => {
                // Always release waits, even when reactive seeding or evaluation unexpectedly fails.
                signal.removeEventListener('abort', abort);
                try {
                    if (this._disposed)
                        return;
                    this._pendingInstanceSources.delete(name);
                    this.runInstanceDependentSeeding();
                    this._evaluate();
                    if (installed) {
                        if (!resolver && instance.static)
                            FormEngine.instanceSourceCache.set(source, cloneValue(this.instanceData[name]));
                        this._instanceSourceOutcomes[name] = { status: 'loaded' };
                    }
                }
                catch (error) {
                    if (installed) {
                        if (hadPrevious)
                            Object.defineProperty(this.instanceData, name, { value: previous, enumerable: true, writable: true, configurable: true });
                        else
                            delete this.instanceData[name];
                        this.instanceVersion.value += 1;
                    }
                    this._instanceSourceOutcomes[name] = { status: 'failed', reason: sourceErrorMessage(error) };
                    // Primary seeding may have partially applied; this engine must be replaced.
                    this.dispose();
                }
                finally {
                    this._pendingInstanceSources.delete(name);
                    settle();
                }
            });
        });
        this._instanceSourceTasks.push(task);
    }
    initializeBindConfigs(items, prefix = '') {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            if (item.type === 'field') {
                this._fieldDataTypes[path] = item.dataType;
            }
            const inlineBind = extractInlineBind(item, path);
            if (inlineBind) {
                this._bindConfigs[path] = { ...this._bindConfigs[path], ...inlineBind };
                if (inlineBind.calculate) {
                    this._calculatedFields.add(path);
                }
            }
            if (item.children) {
                this.initializeBindConfigs(item.children, path);
            }
        }
        for (const bind of this.definition.binds ?? []) {
            // Core §4.3.3 / Rust BindTargets: only `[*]` is stripped; a concrete `[n]` names no Item.
            const path = bind.path.replace(/\[\*\]/g, '');
            this._bindConfigs[path] = { ...this._bindConfigs[path], ...bind, path };
            if (bind.calculate) {
                this._calculatedFields.add(path);
            }
        }
        for (const shape of this.definition.shapes ?? []) {
            if (shape.id) {
                this._shapeTiming.set(shape.id, (shape.timing ?? 'continuous'));
                if (!this.shapeResults[shape.id]) {
                    this.shapeResults[shape.id] = this._rx.signal([]);
                }
            }
        }
        for (const variableDef of this._variableDefs) {
            const key = `${variableDef.scope ?? '#'}:${variableDef.name}`;
            this.variableSignals[key] = this._rx.signal(null);
            const existing = this._variableSignalKeys.get(variableDef.name) ?? [];
            existing.push(key);
            this._variableSignalKeys.set(variableDef.name, existing);
        }
    }
    /**
     * Core §4.3.3 / §3.10.1: a Bind path resolves to an Item, so one naming an instance (`instances.<name>…`,
     * `@instance('<name>')…`) is a definition error. Instance data is host-written (`setInstanceValue`).
     */
    rejectInstancePathBinds() {
        for (const bind of this.definition.binds ?? []) {
            if (this.instanceTargetUnlessItem(bind.path, bind.path.replace(/\[\*\]/g, ''))) {
                throw new Error(`Bind path '${bind.path}' names an instance, not an Item (Core §4.3.3); `
                    + 'write instance data with setInstanceValue');
            }
        }
    }
    /** `instances` is a legal Item key, so a path whose `itemPath` names an Item is that Item, never an instance target. */
    instanceTargetUnlessItem(path, itemPath) {
        return this._groupItems.has(itemPath) ? null : parseInstanceTarget(path);
    }
    registerItems(items, prefix = '') {
        var _a, _b, _c, _d, _e, _f;
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            (_a = this.relevantSignals)[path] ?? (_a[path] = this._rx.signal(true));
            (_b = this.requiredSignals)[path] ?? (_b[path] = this._rx.signal(false));
            (_c = this.readonlySignals)[path] ?? (_c[path] = this._rx.signal(false));
            (_d = this.validationResults)[path] ?? (_d[path] = this._rx.signal([]));
            (_e = this.writeSources)[path] ?? (_e[path] = this._rx.signal(null));
            (_f = this.errorSignals)[path] ?? (_f[path] = this._rx.signal(null));
            if (item.type === 'field') {
                this._fieldItems.set(path, item);
                this.initializeFieldSignal(path, item);
                this._createFieldVM(path, item);
                if (item.children) {
                    this.registerItemChildren(item.children, path);
                }
                continue;
            }
            if (item.type === 'display') {
                this._displaySignalPaths.add(path);
                if (this._bindConfigs[path]?.calculate) {
                    this.signals[path] = this._rx.signal(null);
                }
                continue;
            }
            if (item.repeatable) {
                const count = item.minRepeat ?? 0;
                this.repeats[path] = this._rx.signal(count);
                for (let index = 0; index < count; index += 1) {
                    this.registerItemChildren(item.children ?? [], `${path}[${index}]`);
                }
            }
            else {
                this.registerItemChildren(item.children ?? [], path);
            }
        }
    }
    registerItemChildren(items, prefix) {
        var _a, _b, _c, _d, _e, _f, _g;
        for (const item of items) {
            const path = `${prefix}.${item.key}`;
            this._groupItems.set(path, item);
            (_a = this.relevantSignals)[path] ?? (_a[path] = this._rx.signal(true));
            (_b = this.requiredSignals)[path] ?? (_b[path] = this._rx.signal(false));
            (_c = this.readonlySignals)[path] ?? (_c[path] = this._rx.signal(false));
            (_d = this.validationResults)[path] ?? (_d[path] = this._rx.signal([]));
            (_e = this.writeSources)[path] ?? (_e[path] = this._rx.signal(null));
            (_f = this.errorSignals)[path] ?? (_f[path] = this._rx.signal(null));
            if (item.type === 'field') {
                this._fieldItems.set(toBasePath(path), item);
                this.initializeFieldSignal(path, item);
                this._createFieldVM(path, item);
                if (item.children) {
                    this.registerItemChildren(item.children, path);
                }
                continue;
            }
            if (item.type === 'display') {
                this._displaySignalPaths.add(path);
                if (this._bindConfigs[toBasePath(path)]?.calculate) {
                    (_g = this.signals)[path] ?? (_g[path] = this._rx.signal(null));
                }
                continue;
            }
            if (item.repeatable) {
                const count = item.minRepeat ?? 0;
                this.repeats[path] = this._rx.signal(count);
                for (let index = 0; index < count; index += 1) {
                    this.registerItemChildren(item.children ?? [], `${path}[${index}]`);
                }
            }
            else {
                this.registerItemChildren(item.children ?? [], path);
            }
        }
    }
    initializeFieldSignal(path, item) {
        if (this.signals[path]) {
            return;
        }
        const hasExpressionInitial = typeof item.initialValue === 'string' && item.initialValue.startsWith('=');
        const initial = this.resolveInitialFieldValue(path, item);
        this.signals[path] = this._rx.signal(cloneValue(initial));
        if (!hasExpressionInitial) {
            this._data[path] = cloneValue(initial);
        }
    }
    resolveInitialFieldValue(path, item) {
        const prePopulate = item.prePopulate;
        if (prePopulate && !this._pendingInstanceSources.has(prePopulate.instance)) {
            const resolved = resolvePrePopulateFromInstance(item, path, this._seedFromGroups, (instanceName, instancePath) => this.getInstanceData(instanceName, instancePath), (instanceName) => this.instanceData[instanceName]);
            if (resolved !== undefined) {
                return cloneValue(resolved);
            }
        }
        if (typeof item.initialValue === 'string' && item.initialValue.startsWith('=')) {
            return emptyValueForItem(item);
        }
        if (item.initialValue !== undefined) {
            return coerceInitialValue(item, item.initialValue, this.definition);
        }
        return emptyValueForItem(item);
    }
    runInstanceDependentSeeding() {
        for (const { path: groupPath, item, seedFrom } of this._seedFromGroups) {
            if (this._seedFromResolvedPaths.has(groupPath)) {
                continue;
            }
            const minRepeat = item.minRepeat ?? 0;
            if (repeatHasHostData(groupPath, this._data, this.signals, minRepeat)) {
                this._seedFromResolvedPaths.add(groupPath);
                continue;
            }
            if (this._pendingInstanceSources.has(seedFrom.instance))
                continue;
            if (this.instanceData[seedFrom.instance] === undefined) {
                continue;
            }
            const array = getNestedValue(this.instanceData[seedFrom.instance], seedFrom.path);
            const arrayLength = Array.isArray(array) ? array.length : 0;
            const maxRepeat = item.maxRepeat;
            const target = Math.max(minRepeat, maxRepeat === undefined ? arrayLength : Math.min(arrayLength, maxRepeat));
            const repeatSignal = this.repeats[groupPath];
            if (!repeatSignal) {
                continue;
            }
            this._rx.batch(() => {
                while (repeatSignal.value < target) {
                    this.appendRepeatRow(groupPath, item);
                }
            });
            this._seedFromResolvedPaths.add(groupPath);
        }
        for (const [basePath, fieldItem] of this._fieldItems.entries()) {
            if (!fieldItem.prePopulate || this._pendingInstanceSources.has(fieldItem.prePopulate.instance)) {
                continue;
            }
            const paths = Object.keys(this.signals).filter((candidate) => toBasePath(candidate) === basePath);
            for (const path of paths) {
                if (this._sourceSeedPreservedFields.has(path) || (this._instanceSourceResolver && this.writeSources[path]?.value != null))
                    continue;
                if (!isEmptyValue(this.signals[path]?.value)) {
                    continue;
                }
                const next = this.resolveInitialFieldValue(path, fieldItem);
                if (isEmptyValue(next)) {
                    continue;
                }
                this.signals[path].value = cloneValue(next);
                this._data[path] = cloneValue(next);
            }
        }
    }
    initializeRemoteOptions() {
        for (const bind of Object.values(this._bindConfigs)) {
            if (!bind.remoteOptions) {
                continue;
            }
            const path = toBasePath(bind.path);
            const state = this.optionStateSignals[path] ?? this._rx.signal({ loading: false, error: null });
            this.optionStateSignals[path] = state;
            state.value = { loading: true, error: null };
            const task = fetch(bind.remoteOptions)
                .then((response) => {
                if (!response.ok) {
                    throw new Error(`Remote options fetch failed (${response.status})`);
                }
                return response.json();
            })
                .then((payload) => {
                const options = normalizeRemoteOptions(payload);
                this.optionSignals[path] = this.optionSignals[path] ?? this._rx.signal([]);
                this.optionSignals[path].value = options;
                state.value = { loading: false, error: null };
                this._evaluate();
            })
                .catch((error) => {
                state.value = {
                    loading: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            });
            this._remoteOptionsTasks.push(task);
        }
    }
    writeInstanceValue(instanceName, path, value) {
        const instance = this.definition.instances?.[instanceName];
        if (!instance) {
            throw new Error(`Unknown instance '${instanceName}'`);
        }
        if (instance.readonly !== false) {
            throw new Error(`Instance '${instanceName}' is readonly`);
        }
        let nextValue;
        if (!path) {
            nextValue = cloneValue(value);
        }
        else {
            nextValue = cloneValue(this.instanceData[instanceName] ?? {});
            setNestedPathValue(nextValue, path, cloneValue(value));
        }
        this.validateInstanceSchema(instanceName, nextValue);
        if (deepEqual(this.instanceData[instanceName], nextValue)) {
            return;
        }
        this.instanceData[instanceName] = nextValue;
        this.instanceVersion.value += 1;
    }
    validateInstanceSchema(instanceName, data) {
        const schema = this.definition.instances?.[instanceName]?.schema;
        validateInstanceDataAgainstSchema(instanceName, data, schema && typeof schema === 'object' ? schema : undefined);
    }
    /**
     * The locale FEL formats and reports: the host's runtime locale when it set one, else the Locale
     * document currently selected — so `setLocale('fr')` alone renders French dates, and the patterns
     * `dateFormats` carries always belong to the same locale the built-in rendering falls back to.
     */
    felLocale() {
        return this._runtimeContext.locale ?? (this._localeStore.activeLocale.value || undefined);
    }
    /**
     * WASM-resident FEL context for ad-hoc reads (compileExpression, Locale `{{}}`, derivation trace).
     *
     * The form-scope snapshot is loaded once per engine state: values, MIPs, and results change only through
     * `_evaluate` (evaluation version), rows through structure changes, instances through the instance
     * version. Reading those signals also re-runs a caller's computed whenever the snapshot would change.
     * Each read then names only its expression and Item path, so it costs the scope it resolves against
     * rather than the size of the form.
     */
    felContext() {
        // The Locale version is part of the key: a switch changes the date patterns the snapshot carries.
        const key = `${this._evaluationVersion.value}:${this.structureVersion.value}:${this.instanceVersion.value}:${this._localeStore.version.value}`;
        if (!this._felContext) {
            this._felContext = {
                key: '',
                handle: wasmCreateFelContext(felContextSchema(this._fieldDataTypes, this._bindConfigs, [...this._groupItems.keys()].filter(path => !path.includes('[')))),
            };
        }
        if (this._felContext.key !== key) {
            this._felContext.handle.load(JSON.stringify(felContextSnapshot({
                data: this._data,
                fullResult: this._fullResult,
                repeats: this.repeats,
                instanceData: this.instanceData,
                locale: this.felLocale(),
                dateFormats: this._localeStore.dateFormats() ?? undefined,
                meta: this._runtimeContext.meta,
                subjectKeys: this._responseSubject?.keys,
            })));
            this._felContext.key = key;
        }
        return this._felContext.handle;
    }
    repeatCountsSnapshot() {
        return Object.fromEntries(Object.entries(this.repeats).map(([path, repeatSignal]) => [path, repeatSignal.value]));
    }
    relevanceBindPathCandidates(path) {
        const parts = splitIndexedPath(path);
        const candidates = [];
        let current = '';
        for (const part of parts) {
            current = current ? appendPath(current, part) : part;
            candidates.push(toBasePath(current));
        }
        return candidates;
    }
    findGoverningRelevanceBindPath(path) {
        const candidates = this.relevanceBindPathCandidates(path);
        for (const candidate of candidates) {
            if (this._bindConfigs[candidate]?.relevant && this.relevantSignals[candidate]?.value === false) {
                return candidate;
            }
        }
        for (const candidate of candidates.reverse()) {
            if (this._bindConfigs[candidate]?.relevant) {
                return candidate;
            }
        }
        return null;
    }
    expressionDependencies(expression, currentPath = '') {
        return [...this.collectExpressionDependencies(expression, currentPath, new Set())].sort();
    }
    collectExpressionDependencies(expression, currentPath, seenVariables) {
        const dependencies = new Set();
        try {
            for (const dependency of getFELDependencies(expression)
                .map(FormEngine.normalizeDependencyPath)
                .filter((dependency) => dependency.length > 0)) {
                dependencies.add(dependency);
            }
        }
        catch {
            // Static dependency extraction is best-effort; callers treat missing deps as no impact.
        }
        for (const variableDef of this.visibleVariableDefinitions(expression, currentPath)) {
            const scope = this.variableScopePath(variableDef.scope);
            const key = `${scope}:${variableDef.name}`;
            if (seenVariables.has(key)) {
                continue;
            }
            seenVariables.add(key);
            const variablePath = scope === '#' ? '' : scope;
            for (const dependency of this.collectExpressionDependencies(variableDef.expression, variablePath, seenVariables)) {
                dependencies.add(dependency);
            }
        }
        return dependencies;
    }
    variableScopePath(scope = '#') {
        if (scope === '#' || this._groupItems.has(scope))
            return scope;
        for (const [path, item] of this._groupItems) {
            if (!path.includes('[') && item.key === scope)
                return path;
        }
        return scope;
    }
    visibleVariableDefinitions(expression, currentPath) {
        let names;
        try {
            const analysis = analyzeFEL(expression);
            names = Array.isArray(analysis.variables) ? analysis.variables : [];
        }
        catch {
            return [];
        }
        const definitions = [];
        const scopes = ['#', ...getScopeAncestors(currentPath)];
        for (const name of names) {
            let visible;
            for (const scope of scopes) {
                for (const variableDef of this._variableDefs) {
                    if (variableDef.name === name && this.variableScopePath(variableDef.scope) === scope) {
                        visible = variableDef;
                    }
                }
            }
            if (visible) {
                definitions.push(visible);
            }
        }
        return definitions;
    }
    downstreamDependencyEdges() {
        const edges = new Map();
        const addEdges = (targetPath, expressions) => {
            const target = targetPath === '#' ? '#' : toBasePath(targetPath);
            for (const expression of expressions) {
                if (typeof expression !== 'string' || expression.length === 0) {
                    continue;
                }
                for (const dependency of this.expressionDependencies(expression, target)) {
                    if (dependency === target) {
                        continue;
                    }
                    const targets = edges.get(dependency) ?? new Set();
                    targets.add(target);
                    edges.set(dependency, targets);
                }
            }
        };
        for (const bind of Object.values(this._bindConfigs)) {
            addEdges(bind.path, [
                bind.calculate,
                bind.relevant,
                bind.required,
                bind.readonly,
                bind.constraint,
            ]);
        }
        for (const shape of this.definition.shapes ?? []) {
            const composedExpressions = [
                ...(shape.and ?? []),
                ...(shape.or ?? []),
                ...(shape.xone ?? []),
                shape.not,
            ].filter((entry) => typeof entry === 'string');
            addEdges(shape.target, [
                shape.constraint,
                shape.activeWhen,
                ...composedExpressions,
            ]);
        }
        return edges;
    }
    static normalizeDependencyPath(path) {
        return toBasePath(path.replace(/^\$/, '').replace(/^\./, ''));
    }
    static pathDependencyMatches(source, dependency) {
        return source === dependency
            || source.startsWith(`${dependency}.`)
            || dependency.startsWith(`${source}.`);
    }
    assertNoRemovedModeOption(options, method) {
        if (options && typeof options === 'object' && 'mode' in options) {
            throw new Error(`${method}: { mode } removed; pass { profile } instead. See packages/formspec-engine/README.md.`);
        }
    }
    assertValidationReportOptions(options, method) {
        this.assertNoRemovedModeOption(options, method);
        if (!options || typeof options !== 'object') {
            return;
        }
        for (const key of Object.keys(options)) {
            if (key !== 'profile') {
                throw new Error(`${method}: unknown validation option '${key}'; pass { profile }.`);
            }
        }
    }
    shapedEvalResult(base) {
        return mergeWasmEvalWithExternalValidations(base, {
            externalValidations: this._externalValidation,
        });
    }
    _evaluate(previousResult = this._fullResult) {
        const baseResult = wasmEvaluateDefinition(this.definition, this._data, wasmEvaluateDefinitionPayload({
            nowIso: this.nowISO(),
            previousResult,
            instances: this.instanceData,
            registryDocuments: this._registryDocuments,
            repeatCounts: this.repeatCountsSnapshot(),
            subjectType: this._responseSubject && (this._responseSubject.type ?? null),
            subjectKeys: this._responseSubject?.keys,
        }), this._extensionFunctions);
        if (this._responseSubject) {
            const refusal = baseResult.validations.find(({ path }) => path === '#subjectType' || path === '#subjectKeys' || path.startsWith('#subjectKeys.'));
            if (refusal) {
                throw new Error(`${refusal.path}: ${refusal.message}`);
            }
        }
        const evalResult = this.shapedEvalResult(baseResult);
        // Shape timing is enforced in Rust `revalidate` for the default continuous WASM eval;
        // no TS-side filter needed for parity with batch eval.
        const delta = diffEvalResults(this._previousEvalResult, evalResult);
        // Assign before patching: effects that run when the batch closes read `_fullResult` through FEL contexts.
        this._previousEvalResult = evalResult;
        this._fullResult = evalResult;
        this._rx.batch(() => {
            patchValueSignalsFromWasm({
                values: evalResult.values,
                signals: this.signals,
                data: this._data,
                fieldItems: this._fieldItems,
                bindConfigs: this._bindConfigs,
                calculatedFields: this._calculatedFields,
            });
            patchDeltaSignalsFromWasm(this._rx, delta, {
                relevantSignals: this.relevantSignals,
                requiredSignals: this.requiredSignals,
                readonlySignals: this.readonlySignals,
                validationResults: this.validationResults,
                shapeResults: this.shapeResults,
                variableSignals: this.variableSignals,
                variableSignalKeys: this._variableSignalKeys,
            });
            patchErrorSignalsFromWasm(this._rx, {
                validationResults: this.validationResults,
                errorSignals: this.errorSignals,
            });
            this._evaluationVersion.value += 1;
        });
    }
    evaluateResultForTrigger(trigger, nowIso = this.nowISO()) {
        return this.shapedEvalResult(wasmEvaluateDefinition(this.definition, this._data, wasmEvaluateDefinitionPayload({
            nowIso,
            trigger,
            previousResult: this._fullResult,
            instances: this.instanceData,
            registryDocuments: this._registryDocuments,
            repeatCounts: this.repeatCountsSnapshot(),
            subjectType: this._responseSubject && (this._responseSubject.type ?? null),
            subjectKeys: this._responseSubject?.keys,
        }), this._extensionFunctions));
    }
    resolveRepeatPath(itemName) {
        return this.repeats[itemName] ? itemName : toBasePath(itemName);
    }
    clearRepeatSubtree(rootRepeatPath, firstIndex = 0) {
        const repeatPrefix = `${rootRepeatPath}[`;
        const includesPath = (path) => path.startsWith(repeatPrefix) && (firstIndex === 0 || Number(path.slice(repeatPrefix.length, path.indexOf(']', repeatPrefix.length))) >= firstIndex);
        for (const path of Object.keys(this._fieldViewModels)) {
            if (includesPath(path)) {
                delete this._fieldViewModels[path];
            }
        }
        for (const path of this._itemLabelSignals.keys()) {
            if (includesPath(path)) {
                this._itemLabelSignals.delete(path);
            }
        }
        for (const key of this._itemHelpTextSignals.keys()) {
            if (includesPath(key.slice(key.indexOf(':') + 1))) {
                this._itemHelpTextSignals.delete(key);
            }
        }
        for (const path of this._sourceSeedPreservedFields) {
            if (includesPath(path))
                this._sourceSeedPreservedFields.delete(path);
        }
        clearRepeatIndexedSubtree({
            includesPath,
            signals: this.signals,
            relevantSignals: this.relevantSignals,
            requiredSignals: this.requiredSignals,
            readonlySignals: this.readonlySignals,
            errorSignals: this.errorSignals,
            validationResults: this.validationResults,
            writeSources: this.writeSources,
            optionSignals: this.optionSignals,
            optionStateSignals: this.optionStateSignals,
            repeats: this.repeats,
            data: this._data,
        });
    }
    _createFieldVM(path, item) {
        const basePath = toBasePath(path);
        const vm = createFieldViewModel({
            rx: this._rx,
            localeStore: this._localeStore,
            templatePath: basePath,
            instancePath: path,
            id: `field-${path.replace(/[\.\[\]]/g, '-')}`,
            itemKey: item.key,
            dataType: item.dataType ?? 'string',
            getItemLabel: () => item.label,
            getItemHint: () => item.hint ?? null,
            getItemDescription: () => item.description ?? null,
            getItemLabels: () => item.labels,
            getLabelContext: () => this._labelContextSignal.value,
            getFieldValue: () => this.signals[path] ?? this._rx.signal(null),
            getRequired: () => this.requiredSignals[path] ?? this._rx.signal(false),
            getVisible: () => this.relevantSignals[path] ?? this._rx.signal(true),
            getReadonly: () => this.readonlySignals[path] ?? this._rx.signal(false),
            getDisabledDisplay: () => this.getDisabledDisplay(path),
            // Validation results are per instance; options are per template.
            getErrors: () => this.validationResults[path] ?? this._rx.signal([]),
            getConstraintMessage: () => this._bindConfigs[basePath]?.constraintMessage ?? null,
            getOptions: () => this.optionSignals[basePath] ?? this._rx.signal([]),
            getOptionsState: () => this.optionStateSignals[basePath] ?? this._rx.signal({ loading: false, error: null }),
            getOptionSetName: () => item.optionSet,
            setFieldValue: (value, options) => this.setValue(path, value, options),
            getWriteSource: () => { var _a; return ((_a = this.writeSources)[path] ?? (_a[path] = this._rx.signal(null))); },
            interpolate: (template) => this._interpolate(template, path),
            interpolateMessage: (template) => this._interpolate(template, path),
        });
        this._fieldViewModels[path] = vm;
    }
    /**
     * Locale §3.3.2: resolve `{{}}` in `template` in the binding scope of `itemPath` (form scope when empty),
     * one WASM call per template. Plain text skips the FEL context, so it tracks no evaluation signals.
     */
    _interpolate(template, itemPath = '') {
        if (!template.includes('{{')) {
            return template;
        }
        return parseJsonExact(this.felContext().interpolate(template, itemPath, true, this.nowISO(), this._extensionFunctions)).text;
    }
    getDisplayedIssuerPin() {
        if (this._resolvedIssuer
            && this._resolvedIssuerEpoch === this._issuerResolutionEpoch
            && this._resolvedIssuer.source !== 'unbranded') {
            return {
                url: this._resolvedIssuer.primary.url,
                version: this._resolvedIssuer.primary.version,
            };
        }
        const immediateSource = this._issuerOverride ?? definitionIssuerSource(this.definition);
        if (immediateSource?.kind === 'inline') {
            return {
                url: immediateSource.issuer.url,
                version: immediateSource.issuer.version,
            };
        }
        if (immediateSource?.kind === 'url') {
            throw new Error('Issuer URL must be resolved with getResolvedIssuer() before getResponse() can emit displayedIssuer');
        }
        return undefined;
    }
    /**
     * Submit-time pin of the Locale document whose strings the respondent saw — mirrors
     * {@link getDisplayedIssuerPin}. Reads the document {@link LocaleStore.getActiveDocument}
     * resolves for the active locale tag. A Locale document's identity is its target plus its
     * normalized locale (Locale spec), so the pin is `locale` + `version`, with the document's own
     * `url` when it declares one (Locale §url is OPTIONAL, unlike Issuer's). Undefined only when no
     * Locale document is active — the Definition's inline wording was shown.
     */
    getDisplayedLocalePin() {
        const doc = this._localeStore.getActiveDocument();
        if (!doc) {
            return undefined;
        }
        return { ...(doc.url ? { url: doc.url } : {}), version: doc.version, locale: doc.locale };
    }
}
FormEngine.instanceSourceCache = new Map();
function definitionIssuerSource(definition) {
    const issuer = definition.issuer;
    if (!issuer || typeof issuer !== 'object') {
        return undefined;
    }
    const record = issuer;
    if (record.$formspecIssuer === '1.0' && typeof record.url === 'string') {
        return { kind: 'inline', issuer: issuer };
    }
    if (typeof record.url === 'string') {
        return { kind: 'url', url: record.url };
    }
    return undefined;
}
function assertNeverReplayEvent(event) {
    const unreachable = event;
    throw new Error(`Unsupported replay event: ${unreachable.type}`);
}
