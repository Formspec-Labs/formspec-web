/** @filedesc Reactive FormEngine: field signals, WASM-backed FEL evaluation, validation, and response assembly. */
import type { FormDefinition, FormItem, FormResponse, OptionEntry, ValidationReport, ValidationResult, ValidationProfile } from '@formspec-org/types';
import { type FelExtensionFunctionRegistration } from '../extension-functions.js';
import type { SetValueOptions, WriteSource, AuthoredSignatureInput, EngineReplayApplyResult, EngineReplayEvent, EngineReplayResult, FormEngineDiagnosticsSnapshot, FormEngineOptions, FormEngineRuntimeContext, FormFieldValue, IFormEngine, JsonRecord, JsonValue, PinnedResponseReference, RelevanceExplanation, RegistryEntry, RemoteOptionsState } from '../interfaces.js';
import { type FelTraceStep } from '../fel/fel-api-runtime.js';
import type { EngineSignal, ReadonlyEngineSignal } from '../reactivity/types.js';
import { type LocaleDocument } from '../locale.js';
import type { IssuerSource, ResolvedIssuer } from '../issuer/types.js';
import { type FieldViewModel } from '../field-view-model.js';
import { type FormViewModel } from '../form-view-model.js';
import { type EnabledValidationProfile, type ValidationReportOptions } from '../validation/index.js';
export declare class FormEngine implements IFormEngine {
    static instanceSourceCache: Map<string, JsonValue>;
    readonly definition: FormDefinition;
    readonly signals: Record<string, EngineSignal<FormFieldValue>>;
    readonly relevantSignals: Record<string, EngineSignal<boolean>>;
    readonly requiredSignals: Record<string, EngineSignal<boolean>>;
    readonly readonlySignals: Record<string, EngineSignal<boolean>>;
    readonly errorSignals: Record<string, EngineSignal<string | null>>;
    readonly validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    /** Who last wrote each field (`'user'` by default, `'assist'` for Assist-driven writes); null until written. */
    readonly writeSources: Record<string, EngineSignal<WriteSource | null>>;
    readonly shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
    readonly repeats: Record<string, EngineSignal<number>>;
    readonly optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    readonly optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    readonly variableSignals: Record<string, EngineSignal<FormFieldValue>>;
    readonly instanceData: JsonRecord;
    readonly instanceVersion: EngineSignal<number>;
    readonly structureVersion: EngineSignal<number>;
    readonly localeSignal: ReadonlyEngineSignal<number>;
    private readonly _rx;
    private readonly _evaluationVersion;
    private readonly _bindConfigs;
    private readonly _fieldItems;
    /** `dataType` of every field Item by base path, from the definition (FEL value tagging, scope checks). */
    private readonly _fieldDataTypes;
    /** WASM-resident FEL context for ad-hoc reads, reloaded when `key` (the engine's state epoch) changes. */
    private _felContext;
    private readonly _groupItems;
    private readonly _shapeTiming;
    private readonly _instanceCalculateBinds;
    private readonly _displaySignalPaths;
    private readonly _prePopulateReadonly;
    private readonly _calculatedFields;
    private readonly _registryEntries;
    /** Host FEL extension functions (Core §3.12), passed to every Rust evaluation. */
    private readonly _extensionFunctions;
    private _registryDocuments;
    private readonly _remoteOptionsTasks;
    private readonly _instanceSourceTasks;
    private readonly _variableDefs;
    private readonly _variableSignalKeys;
    private readonly _derivationTraceCache;
    private readonly _externalValidation;
    private readonly _issuerStore;
    private readonly _validationProfileResolver;
    private readonly _localeStore;
    private readonly _fieldViewModels;
    private readonly _itemLabelSignals;
    /** Hint / description signals for Items with no field view model, keyed `<property>:<instance path>`. */
    private readonly _itemHelpTextSignals;
    private _formViewModel;
    private readonly _labelContextSignal;
    private _data;
    private _previousEvalResult;
    private _fullResult;
    private _issuerOverride;
    private _resolvedIssuer;
    private _issuerResolutionPromise;
    private _issuerResolutionEpoch;
    private _resolvedIssuerEpoch;
    private _runtimeContext;
    constructor(definition: FormDefinition, optionsOrRuntimeContext?: FormEngineOptions | FormEngineRuntimeContext, legacyRegistryEntries?: RegistryEntry[]);
    static resolvePinnedDefinition<T extends {
        url?: string;
        version?: string;
    }>(response: PinnedResponseReference, definitions: T[]): T;
    get formPresentation(): FormDefinition['formPresentation'] | null;
    setRuntimeContext(context?: FormEngineRuntimeContext): void;
    setIssuerOverride(source: IssuerSource | undefined): void;
    getResolvedIssuer(): Promise<ResolvedIssuer>;
    getOptions(path: string): OptionEntry[];
    getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined;
    getOptionsState(path: string): RemoteOptionsState;
    getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined;
    waitForRemoteOptions(): Promise<void>;
    waitForInstanceSources(): Promise<void>;
    setInstanceValue(name: string, path: string | undefined, value: FormFieldValue): void;
    getInstanceData(name: string, path?: string): FormFieldValue;
    getDisabledDisplay(path: string): 'hidden' | 'protected';
    getVariableValue(name: string, scopePath: string): FormFieldValue;
    /** Appends a row and returns its index; `undefined` when the path is not repeatable or already at `maxRepeat` (Core §4.2.2). */
    addRepeatInstance(itemName: string): number | undefined;
    removeRepeatInstance(itemName: string, index: number): void;
    /**
     * Loads a Response `data` tree with one evaluation. Definition-directed: a repeatable group present in
     * `data` gets exactly one row per array entry, past `maxRepeat` or below `minRepeat` included, so loaded
     * data reports MAX_REPEAT / MIN_REPEAT instead of losing rows. Keys absent from `data` keep their state;
     * calculated fields and undeclared keys are ignored.
     */
    loadResponseData(data: JsonRecord): void;
    private loadItemsData;
    private appendRepeatRow;
    /** Re-keys repeat `path` to the rows `select` keeps from a snapshot of every current row. O(rows). */
    private rebuildRepeatRows;
    compileExpression(expression: string, currentItemName?: string): () => FormFieldValue;
    setValue(name: string, value: FormFieldValue, options?: SetValueOptions): void;
    /** Coerces and stores a field value without evaluating; false for calculated or undeclared fields. */
    private writeFieldData;
    getValidationReport(): ValidationReport;
    getValidationReport(options: {
        profile?: EnabledValidationProfile;
    }): ValidationReport;
    getValidationReport(options: {
        profile: 'off';
    }): null;
    getValidationReport(options?: ValidationReportOptions): ValidationReport | null;
    /** Report for `trigger` plus the expression diagnostics of the evaluation that produced it. */
    private produceValidation;
    evaluateShape(shapeId: string): ValidationResult[];
    isPathRelevant(path: string): boolean;
    whyRelevant(path: string): RelevanceExplanation;
    getDerivationTree(path: string): FelTraceStep[];
    getDownstreamImpact(path: string): string[];
    getFieldPaths(): string[];
    getProgress(): import('../interfaces.js').FormProgress;
    getResponse(meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        subject?: {
            id: string;
            type?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
        profile?: ValidationProfile;
    }): FormResponse;
    getDiagnosticsSnapshot(options?: ValidationReportOptions): FormEngineDiagnosticsSnapshot;
    applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult;
    replay(events: EngineReplayEvent[], options?: {
        stopOnError?: boolean;
    }): EngineReplayResult;
    getDefinition(): FormDefinition;
    setLabelContext(context: string | null): void;
    /** Definition label for the active label context (no Locale, no `{{}}`); reactive to `setLabelContext`. */
    getLabel(item: FormItem): string;
    /**
     * Reactive label a respondent sees for the Item at instance `path` — field, display, or group (a repeat row
     * path such as `jobs[0]` names its group). Same cascade as `FieldViewModel.label` (Locale
     * `<key>.label@context` → `<key>.label` → `labels[context]` → inline), `{{}}` interpolated in the Item's
     * scope. `undefined` when no Item has that path.
     */
    getItemLabelSignal(path: string): ReadonlyEngineSignal<string> | undefined;
    /**
     * Reactive hint a respondent sees for the Item at instance `path` — field, display, or group. Same
     * cascade as `FieldViewModel.hint` (Locale `<key>.hint@context` → `<key>.hint` → inline `hint`; no
     * Definition-side context step), `{{}}` interpolated in the Item's scope. `null` when no source has
     * one; `undefined` when no Item has that path.
     */
    getItemHintSignal(path: string): ReadonlyEngineSignal<string | null> | undefined;
    /** {@link FormEngine.getItemHintSignal} for the Item's `description`. */
    getItemDescriptionSignal(path: string): ReadonlyEngineSignal<string | null> | undefined;
    private itemHelpTextSignal;
    loadLocale(doc: LocaleDocument): void;
    setLocale(code: string): void;
    getActiveLocale(): string;
    getAvailableLocales(): string[];
    getLocaleDirection(): 'ltr' | 'rtl';
    getFieldVM(path: string): FieldViewModel | undefined;
    resolveValidationMessage(result: ValidationResult): string;
    getFormVM(): FormViewModel;
    resolveLocaleString(key: string, fallback: string, itemPath?: string): string;
    /**
     * Raw Locale string for `key`, or `null` when no loaded document (through the fallback cascade, §4)
     * carries it. Unlike {@link resolveLocaleString}, this never runs `{{}}` through FEL — for chrome
     * strings (Locale §3.1.10 `$ui.<ChromeStringKey>`), whose `{{$param}}` placeholders are renderer-
     * supplied literals (`$label`, `$index`, ...), not form-scope FEL.
     */
    lookupLocaleString(key: string): string | null;
    injectExternalValidation(results: Array<{
        path: string;
        severity: string;
        code: string;
        message: string;
        source?: string;
    }>): void;
    clearExternalValidation(path?: string): void;
    dispose(): void;
    registerExtensionFunction(name: string, registration: FelExtensionFunctionRegistration): void;
    setRegistryEntries(entries: RegistryEntry[]): void;
    migrateResponse(responseData: JsonRecord, fromVersion: string): JsonRecord;
    private nowISO;
    private static normalizeConstructorOptions;
    private initializeOptionSignals;
    private initializeInstances;
    /**
     * The HTTP(S) URL an instance `source` names, or null when it names something the engine does not fetch —
     * a host-provided scheme such as `formspec-fn:`, or a relative reference with no page to resolve it.
     * On a page, a relative reference resolves against `document.baseURI` like any other relative reference,
     * so `./data/claimant.json` beside a Definition works under whatever path the site is served from.
     * Elsewhere (a server, a test) an absolute URL or a root path is passed through as written.
     */
    private static resolveInstanceSource;
    private initializeInstanceSource;
    private initializeBindConfigs;
    private collectInstanceCalculateBinds;
    private validateInstanceCalculateTargets;
    private registerItems;
    private registerItemChildren;
    private initializeFieldSignal;
    private resolveInitialFieldValue;
    private initializeRemoteOptions;
    private writeInstanceValue;
    private validateInstanceSchema;
    private evaluateExpression;
    private felContextInput;
    /**
     * The locale FEL formats and reports: the host's runtime locale when it set one, else the Locale
     * document currently selected — so `setLocale('fr')` alone renders French dates, and the patterns
     * `dateFormats` carries always belong to the same locale the built-in rendering falls back to.
     */
    private felLocale;
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
    private felContext;
    private repeatCountsSnapshot;
    private relevanceBindPathCandidates;
    private findGoverningRelevanceBindPath;
    private expressionDependencies;
    private collectExpressionDependencies;
    private visibleVariableDefinitions;
    private downstreamDependencyEdges;
    private static normalizeDependencyPath;
    private static pathDependencyMatches;
    private assertNoRemovedModeOption;
    private assertValidationReportOptions;
    private shapedEvalResult;
    private _evaluate;
    private evaluateResultForTrigger;
    private applyInstanceCalculates;
    private syncInstanceCalculateSignals;
    private normalizeExpressionForWasm;
    private resolveRepeatPath;
    private clearRepeatSubtree;
    private _createFieldVM;
    /**
     * Locale §3.3.2: resolve `{{}}` in `template` in the binding scope of `itemPath` (form scope when empty),
     * one WASM call per template. Plain text skips the FEL context, so it tracks no evaluation signals.
     * `bindScope` binds bare `$` to the item, as its Bind does — the scope a validation message resolves in.
     */
    private _interpolate;
    private getDisplayedIssuerPin;
}
