/** @filedesc Reactive FormEngine: field signals, WASM-backed FEL evaluation, validation, and response assembly. */
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
import { validateInstanceDataAgainstSchema } from './instance-schema.js';
import { patchDeltaSignalsFromWasm, patchErrorSignalsFromWasm, patchValueSignalsFromWasm, } from './reactive-patches.js';
import { applyRepeatGroupTreeSnapshot, clearRepeatIndexedSubtree, snapshotRepeatGroupTree, } from './repeat-ops.js';
import { buildFormspecResponseEnvelope, buildValidationReportEnvelope, collectTimedShapeValidationResults, migrateResponseData, resolvePinnedDefinition, } from './response-assembly.js';
import { buildWasmFelExpressionContext, mergeWasmEvalWithExternalValidations, normalizeExpressionForWasmEvaluation, visibleScopedVariableValues, wasmEvaluateDefinitionPayload, } from './wasm-fel.js';
import { felContextSchema, felContextSnapshot } from './fel-context.js';
import { appendPath, cloneValue, coerceFieldValue, coerceInitialValue, deepEqual, emptyValueForItem, extractInlineBind, getAncestorBasePaths, getNestedValue, getScopeAncestors, isJsonRecord, isEmptyValue, makeValidationResult, normalizeRemoteOptions, parseInstanceTarget, resolveNowProvider, safeEvaluateExpression, setNestedPathValue, setResponsePathValue, splitIndexedPath, toBasePath, toValidationResult, } from './helpers.js';
import { DefaultValidationProfileResolver, } from '../validation/index.js';
export class FormEngine {
    constructor(definition, optionsOrRuntimeContext, legacyRegistryEntries) {
        this.signals = {};
        this.relevantSignals = {};
        this.requiredSignals = {};
        this.readonlySignals = {};
        this.errorSignals = {};
        this.validationResults = {};
        this.shapeResults = {};
        this.repeats = {};
        this.optionSignals = {};
        this.optionStateSignals = {};
        this.variableSignals = {};
        this.instanceData = {};
        this._bindConfigs = {};
        this._fieldItems = new Map();
        /** `dataType` of every field Item by base path, from the definition (FEL value tagging, scope checks). */
        this._fieldDataTypes = {};
        /** WASM-resident FEL context for ad-hoc reads, reloaded when `key` (the engine's state epoch) changes. */
        this._felContext = null;
        this._groupItems = new Map();
        this._shapeTiming = new Map();
        this._instanceCalculateBinds = [];
        this._displaySignalPaths = new Set();
        this._prePopulateReadonly = new Set();
        this._calculatedFields = new Set();
        this._registryEntries = new Map();
        /** Host FEL extension functions (Core §3.12), passed to every Rust evaluation. */
        this._extensionFunctions = new FelExtensionFunctions();
        this._registryDocuments = [];
        this._remoteOptionsTasks = [];
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
        const options = FormEngine.normalizeConstructorOptions(optionsOrRuntimeContext, legacyRegistryEntries);
        const { runtimeContext, registryEntries, reactiveRuntime = preactReactiveRuntime, issuerFetcher, issuerOverride, extensionFunctions, } = options;
        this._rx = reactiveRuntime;
        this._issuerStore = new IssuerStore(issuerFetcher ?? new FetchIssuerFetcher());
        this._validationProfileResolver = new DefaultValidationProfileResolver();
        this._issuerOverride = issuerOverride;
        this.instanceVersion = this._rx.signal(0);
        this.structureVersion = this._rx.signal(0);
        this._evaluationVersion = this._rx.signal(0);
        this._labelContextSignal = this._rx.signal(null);
        this.definition = cloneValue(definition);
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
        this.definition = resolveOptionSetsOnDefinition(this.definition);
        this.initializeOptionSignals();
        this.initializeInstances();
        this.initializeBindConfigs(this.definition.items);
        this.collectInstanceCalculateBinds();
        this.validateInstanceCalculateTargets();
        validateVariableDefinitionCycles(this._variableDefs);
        validateCalculateBindCycles(this._bindConfigs);
        this.registerItems(this.definition.items);
        this.initializeRemoteOptions();
        this._evaluate();
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
        const visible = visibleScopedVariableValues(scopePath, this._variableDefs, this.variableSignals);
        return visible[name];
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
        this.rebuildRepeatRows(path, item, (rows) => rows.filter((_row, current) => current !== index));
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
    loadItemsData(items, data, prefix) {
        for (const item of items) {
            if (!Object.prototype.hasOwnProperty.call(data, item.key)) {
                continue;
            }
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const value = data[item.key];
            if (item.type === 'field') {
                this.writeFieldData(path, value);
            }
            else if (item.type === 'group' && item.repeatable && this.repeats[path]) {
                const rows = Array.isArray(value) ? value : [];
                if (this.repeats[path].value > rows.length) {
                    this.rebuildRepeatRows(path, item, (snapshots) => snapshots.slice(0, rows.length));
                }
                while (this.repeats[path].value < rows.length) {
                    this.appendRepeatRow(path, item);
                }
                rows.forEach((row, index) => {
                    if (isJsonRecord(row)) {
                        this.loadItemsData(item.children ?? [], row, `${path}[${index}]`);
                    }
                });
            }
            else if (item.type === 'group' && !item.repeatable && isJsonRecord(value)) {
                this.loadItemsData(item.children ?? [], value, path);
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
    /** Re-keys repeat `path` to the rows `select` keeps from a snapshot of every current row. O(rows). */
    rebuildRepeatRows(path, item, select) {
        const snapshots = [];
        for (let current = 0; current < this.repeats[path].value; current += 1) {
            snapshots.push(snapshotRepeatGroupTree(item.children ?? [], `${path}[${current}]`, (fieldPath) => cloneValue(this.signals[fieldPath]?.value), (repeatPath) => this.repeats[repeatPath]?.value ?? 0));
        }
        const rows = select(snapshots);
        this._rx.batch(() => {
            this.clearRepeatSubtree(path);
            this.repeats[path].value = rows.length;
            for (let current = 0; current < rows.length; current += 1) {
                this.registerItemChildren(item.children ?? [], `${path}[${current}]`);
                applyRepeatGroupTreeSnapshot(item.children ?? [], `${path}[${current}]`, rows[current], (fieldPath, value) => {
                    const v = cloneValue(value);
                    this._data[fieldPath] = v;
                    if (this.signals[fieldPath]) {
                        this.signals[fieldPath].value = v;
                    }
                });
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
            return JSON.parse(this.felContext().evaluate(expression, currentItemName, false, this.nowISO(), this._extensionFunctions)).value;
        };
    }
    setValue(name, value) {
        if (typeof name !== 'string') {
            throw new TypeError('setValue path cannot be null');
        }
        const instanceTarget = parseInstanceTarget(name);
        if (instanceTarget) {
            this.writeInstanceValue(instanceTarget.instanceName, instanceTarget.instancePath, value);
            this._evaluate();
            return;
        }
        if (this.writeFieldData(name, value)) {
            this._evaluate();
        }
    }
    /** Coerces and stores a field value without evaluating; false for calculated or undeclared fields. */
    writeFieldData(name, value) {
        const basePath = toBasePath(name);
        if (this._calculatedFields.has(basePath)) {
            return false;
        }
        const item = this._fieldItems.get(basePath);
        if (!item) {
            return false;
        }
        const bind = this._bindConfigs[basePath];
        const nextValue = coerceFieldValue(item, bind, this.definition, value);
        if (nextValue === undefined) {
            delete this._data[name];
        }
        else {
            this._data[name] = cloneValue(nextValue);
        }
        return true;
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
        if (trigger === 'demand') {
            const demandResult = this.evaluateResultForTrigger('demand');
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
            if (trigger === 'submit') {
                const submitResult = this.evaluateResultForTrigger('submit');
                diagnostics = submitResult.diagnostics;
                results.push(...collectTimedShapeValidationResults(submitResult, this._shapeTiming, 'submit'));
            }
        }
        return {
            report: buildValidationReportEnvelope(results, this.nowISO(), this.definition.url, this.definition.version),
            diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
        };
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
        const cached = this._derivationTraceCache.get(basePath);
        if (cached && cached.version === version) {
            return cached.trace.map((step) => cloneValue(step));
        }
        try {
            const result = JSON.parse(this.felContext().evaluateTrace(calculate, basePath, false, this.nowISO(), this._extensionFunctions));
            const trace = Array.isArray(result.trace) ? result.trace : [];
            this._derivationTraceCache.set(basePath, {
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
    getProgress() {
        let total = 0;
        let filled = 0;
        let valid = 0;
        let required = 0;
        let requiredFilled = 0;
        for (const path of this.getFieldPaths()) {
            if (!this.isPathRelevant(path)) {
                continue;
            }
            total += 1;
            const fieldFilled = !isEmptyValue(this.signals[path]?.value);
            const fieldValid = !(this.validationResults[path]?.value ?? []).some((result) => result.severity === 'error');
            if (fieldFilled) {
                filled += 1;
            }
            if (fieldValid) {
                valid += 1;
            }
            if (this.requiredSignals[path]?.value) {
                required += 1;
                if (fieldFilled) {
                    requiredFilled += 1;
                }
            }
        }
        return {
            total,
            filled,
            valid,
            required,
            requiredFilled,
            complete: required === requiredFilled && this.getValidationReport().valid,
        };
    }
    getResponse(meta) {
        this.assertNoRemovedModeOption(meta, 'getResponse');
        const data = {};
        const profile = meta?.profile ?? 'live';
        const trigger = this._validationProfileResolver.resolve(profile);
        const defaultBehavior = this.definition.nonRelevantBehavior ?? 'remove';
        for (const [path, signalRef] of Object.entries(this.signals)) {
            if (this._displaySignalPaths.has(path)) {
                continue;
            }
            const relevant = this.isPathRelevant(path);
            let behavior = defaultBehavior;
            for (const ancestor of getAncestorBasePaths(path)) {
                const bind = this._bindConfigs[ancestor];
                if (bind?.nonRelevantBehavior) {
                    behavior = bind.nonRelevantBehavior;
                    break;
                }
            }
            if (!relevant && behavior === 'remove') {
                continue;
            }
            const value = !relevant && behavior === 'empty'
                ? null
                : cloneValue(signalRef.value);
            setResponsePathValue(data, path, value);
        }
        const report = trigger === 'disabled' ? null : this.produceValidation(trigger).report;
        return buildFormspecResponseEnvelope({
            definition: this.definition,
            data,
            report,
            completionEligible: trigger === 'submit',
            timestamp: this.nowISO(),
            displayedIssuer: this.getDisplayedIssuerPin(),
            meta,
        });
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
    static normalizeConstructorOptions(optionsOrRuntimeContext, legacyRegistryEntries) {
        const maybeOptions = optionsOrRuntimeContext;
        const hasOptionsShape = maybeOptions !== undefined && (Object.prototype.hasOwnProperty.call(maybeOptions, 'runtimeContext')
            || Object.prototype.hasOwnProperty.call(maybeOptions, 'registryEntries')
            || Object.prototype.hasOwnProperty.call(maybeOptions, 'reactiveRuntime')
            || Object.prototype.hasOwnProperty.call(maybeOptions, 'issuerFetcher')
            || Object.prototype.hasOwnProperty.call(maybeOptions, 'issuerOverride')
            || Object.prototype.hasOwnProperty.call(maybeOptions, 'extensionFunctions'));
        if (hasOptionsShape) {
            return {
                ...maybeOptions,
                registryEntries: maybeOptions.registryEntries ?? legacyRegistryEntries,
            };
        }
        return {
            runtimeContext: optionsOrRuntimeContext,
            registryEntries: legacyRegistryEntries,
        };
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
        visit(this.definition.items);
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
    /** Returns true if the source string is fetchable (HTTP(S) or absolute path). */
    static isFetchableSource(source) {
        return /^https?:\/\//i.test(source) || source.startsWith('/');
    }
    initializeInstanceSource(name, instance) {
        if (!instance.source || !FormEngine.isFetchableSource(instance.source)) {
            return;
        }
        if (instance.static && FormEngine.instanceSourceCache.has(instance.source)) {
            const cached = FormEngine.instanceSourceCache.get(instance.source);
            if (cached !== undefined) {
                this.instanceData[name] = cloneValue(cached);
            }
            return;
        }
        const task = fetch(instance.source)
            .then((response) => {
            if (!response.ok) {
                throw new Error(`Instance source fetch failed (${response.status})`);
            }
            return response.json();
        })
            .then((payload) => {
            this.validateInstanceSchema(name, payload);
            const nextValue = cloneValue(payload);
            if (instance.static) {
                FormEngine.instanceSourceCache.set(instance.source, cloneValue(nextValue));
            }
            this.instanceData[name] = nextValue;
            this.instanceVersion.value += 1;
            this._evaluate();
        })
            .catch((error) => {
            console.error(`Failed to load instance source '${name}':`, error);
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
                if (inlineBind.calculate && !parseInstanceTarget(path)) {
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
            if (bind.calculate && !parseInstanceTarget(bind.path)) {
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
    collectInstanceCalculateBinds() {
        for (const bind of Object.values(this._bindConfigs)) {
            if (bind.calculate && parseInstanceTarget(bind.path)) {
                this._instanceCalculateBinds.push(bind);
            }
        }
    }
    validateInstanceCalculateTargets() {
        for (const bind of this._instanceCalculateBinds) {
            const target = parseInstanceTarget(bind.path);
            if (!target) {
                continue;
            }
            const instance = this.definition.instances?.[target.instanceName];
            if (!instance) {
                throw new Error(`Unknown instance '${target.instanceName}' targeted by bind '${bind.path}'`);
            }
            if (instance.readonly !== false) {
                throw new Error(`Calculate bind cannot target readonly instance '${target.instanceName}'`);
            }
        }
    }
    registerItems(items, prefix = '') {
        var _a, _b, _c, _d, _e;
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            (_a = this.relevantSignals)[path] ?? (_a[path] = this._rx.signal(true));
            (_b = this.requiredSignals)[path] ?? (_b[path] = this._rx.signal(false));
            (_c = this.readonlySignals)[path] ?? (_c[path] = this._rx.signal(false));
            (_d = this.validationResults)[path] ?? (_d[path] = this._rx.signal([]));
            (_e = this.errorSignals)[path] ?? (_e[path] = this._rx.signal(null));
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
        var _a, _b, _c, _d, _e, _f;
        for (const item of items) {
            const path = `${prefix}.${item.key}`;
            this._groupItems.set(path, item);
            (_a = this.relevantSignals)[path] ?? (_a[path] = this._rx.signal(true));
            (_b = this.requiredSignals)[path] ?? (_b[path] = this._rx.signal(false));
            (_c = this.readonlySignals)[path] ?? (_c[path] = this._rx.signal(false));
            (_d = this.validationResults)[path] ?? (_d[path] = this._rx.signal([]));
            (_e = this.errorSignals)[path] ?? (_e[path] = this._rx.signal(null));
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
                    (_f = this.signals)[path] ?? (_f[path] = this._rx.signal(null));
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
        if (prePopulate) {
            const value = this.getInstanceData(prePopulate.instance, prePopulate.path);
            if (value !== undefined) {
                if (prePopulate.editable === false) {
                    this._prePopulateReadonly.add(path);
                }
                return cloneValue(value);
            }
            if (prePopulate.editable === false) {
                this._prePopulateReadonly.add(path);
            }
        }
        if (typeof item.initialValue === 'string' && item.initialValue.startsWith('=')) {
            return emptyValueForItem(item);
        }
        if (item.initialValue !== undefined) {
            return coerceInitialValue(item, item.initialValue);
        }
        return emptyValueForItem(item);
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
    writeInstanceValue(instanceName, path, value, options) {
        const instance = this.definition.instances?.[instanceName];
        if (!instance) {
            throw new Error(`Unknown instance '${instanceName}'`);
        }
        if (!options?.bypassReadonly && instance.readonly !== false) {
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
    evaluateExpression(expression, currentItemPath = '', dataOverride, resultOverride, scopedVariableOverrides, replaceSelfRef = false) {
        return safeEvaluateExpression(this.normalizeExpressionForWasm(expression, currentItemPath, replaceSelfRef), buildWasmFelExpressionContext(this.felContextInput(currentItemPath, {
            resultOverride,
            dataOverride,
            scopedVariableOverrides,
        })), this._extensionFunctions);
    }
    felContextInput(currentItemPath, overrides = {}) {
        return {
            currentItemPath,
            data: this._data,
            fullResult: this._fullResult,
            ...overrides,
            fieldSignals: this.signals,
            validationResults: this.validationResults,
            relevantSignals: this.relevantSignals,
            readonlySignals: this.readonlySignals,
            requiredSignals: this.requiredSignals,
            repeats: this.repeats,
            bindConfigs: this._bindConfigs,
            fieldDataTypes: this._fieldDataTypes,
            variableDefs: this._variableDefs,
            variableSignals: this.variableSignals,
            instanceData: this.instanceData,
            nowIso: this.nowISO(),
            locale: this.felLocale(),
            dateFormats: this._localeStore.dateFormats() ?? undefined,
            meta: this._runtimeContext.meta,
        };
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
     * rather than the size of the form. In-flight evaluation reads use `evaluateExpression`, which builds a
     * one-shot context from the partial state it is midway through producing.
     */
    felContext() {
        // The Locale version is part of the key: a switch changes the date patterns the snapshot carries.
        const key = `${this._evaluationVersion.value}:${this.structureVersion.value}:${this.instanceVersion.value}:${this._localeStore.version.value}`;
        if (!this._felContext) {
            this._felContext = {
                key: '',
                handle: wasmCreateFelContext(felContextSchema(this._fieldDataTypes, this._bindConfigs)),
            };
        }
        if (this._felContext.key !== key) {
            this._felContext.handle.load(JSON.stringify(felContextSnapshot({
                data: this._data,
                fullResult: this._fullResult,
                fieldSignals: this.signals,
                validationResults: this.validationResults,
                relevantSignals: this.relevantSignals,
                readonlySignals: this.readonlySignals,
                requiredSignals: this.requiredSignals,
                repeats: this.repeats,
                variableDefs: this._variableDefs,
                variableSignals: this.variableSignals,
                instanceData: this.instanceData,
                locale: this.felLocale(),
                dateFormats: this._localeStore.dateFormats() ?? undefined,
                meta: this._runtimeContext.meta,
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
            const normalized = this.normalizeExpressionForWasm(expression, currentPath);
            for (const dependency of getFELDependencies(normalized)
                .map(FormEngine.normalizeDependencyPath)
                .filter((dependency) => dependency.length > 0)) {
                dependencies.add(dependency);
            }
        }
        catch {
            // Static dependency extraction is best-effort; callers treat missing deps as no impact.
        }
        for (const variableDef of this.visibleVariableDefinitions(expression, currentPath)) {
            const scope = variableDef.scope ?? '#';
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
                    if (variableDef.name === name && (variableDef.scope ?? '#') === scope) {
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
    _evaluate() {
        const baseResult = wasmEvaluateDefinition(this.definition, this._data, wasmEvaluateDefinitionPayload({
            nowIso: this.nowISO(),
            previousResult: this._fullResult,
            instances: this.instanceData,
            registryDocuments: this._registryDocuments,
            repeatCounts: this.repeatCountsSnapshot(),
        }), this._extensionFunctions);
        const evalResult = this.shapedEvalResult(baseResult);
        // Apply TS-side fixups that WASM can't handle:
        // 1. Instance calculate write-back (binds targeting @instance(...) paths)
        this.applyInstanceCalculates(evalResult);
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
                prePopulateReadonly: this._prePopulateReadonly,
            });
            this.syncInstanceCalculateSignals();
            patchErrorSignalsFromWasm(this._rx, {
                validationResults: this.validationResults,
                errorSignals: this.errorSignals,
            });
            this._evaluationVersion.value += 1;
        });
    }
    evaluateResultForTrigger(trigger) {
        return this.shapedEvalResult(wasmEvaluateDefinition(this.definition, this._data, wasmEvaluateDefinitionPayload({
            nowIso: this.nowISO(),
            trigger,
            previousResult: this._fullResult,
            instances: this.instanceData,
            registryDocuments: this._registryDocuments,
            repeatCounts: this.repeatCountsSnapshot(),
        }), this._extensionFunctions));
    }
    applyInstanceCalculates(result) {
        let changed = false;
        for (const bind of this._instanceCalculateBinds) {
            const target = parseInstanceTarget(bind.path);
            if (!target || !bind.calculate) {
                continue;
            }
            const value = this.evaluateExpression(bind.calculate, '', this._data, result);
            const before = cloneValue(this.getInstanceData(target.instanceName, target.instancePath));
            this.writeInstanceValue(target.instanceName, target.instancePath, value, { bypassReadonly: true });
            if (!deepEqual(before, this.getInstanceData(target.instanceName, target.instancePath))) {
                changed = true;
            }
        }
        return changed;
    }
    syncInstanceCalculateSignals() {
        for (const bind of this._instanceCalculateBinds) {
            const target = parseInstanceTarget(bind.path);
            if (!target || !bind.calculate) {
                continue;
            }
            const nextValue = this.evaluateExpression(bind.calculate);
            if ((nextValue === null || nextValue === undefined)
                && this.getInstanceData(target.instanceName, target.instancePath) !== undefined) {
                continue;
            }
            this.writeInstanceValue(target.instanceName, target.instancePath, nextValue, { bypassReadonly: true });
        }
    }
    normalizeExpressionForWasm(expression, currentItemPath = '', replaceSelfRef = false) {
        return normalizeExpressionForWasmEvaluation({
            expression,
            currentItemPath,
            replaceSelfRef,
            repeats: this.repeats,
            fieldSignals: this.signals,
        });
    }
    resolveRepeatPath(itemName) {
        return this.repeats[itemName] ? itemName : toBasePath(itemName);
    }
    clearRepeatSubtree(rootRepeatPath) {
        const repeatPrefix = `${rootRepeatPath}[`;
        for (const path of Object.keys(this._fieldViewModels)) {
            if (path.startsWith(repeatPrefix)) {
                delete this._fieldViewModels[path];
            }
        }
        for (const path of this._itemLabelSignals.keys()) {
            if (path.startsWith(repeatPrefix)) {
                this._itemLabelSignals.delete(path);
            }
        }
        for (const key of this._itemHelpTextSignals.keys()) {
            if (key.slice(key.indexOf(':') + 1).startsWith(repeatPrefix)) {
                this._itemHelpTextSignals.delete(key);
            }
        }
        clearRepeatIndexedSubtree({
            rootRepeatPath,
            signals: this.signals,
            relevantSignals: this.relevantSignals,
            requiredSignals: this.requiredSignals,
            readonlySignals: this.readonlySignals,
            errorSignals: this.errorSignals,
            validationResults: this.validationResults,
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
            getOptions: () => this.optionSignals[basePath] ?? this._rx.signal([]),
            getOptionsState: () => this.optionStateSignals[basePath] ?? this._rx.signal({ loading: false, error: null }),
            getOptionSetName: () => item.optionSet,
            setFieldValue: (value) => this.setValue(path, value),
            interpolate: (template) => this._interpolate(template, path),
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
        return JSON.parse(this.felContext().interpolate(template, itemPath, this.nowISO(), this._extensionFunctions)).text;
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
