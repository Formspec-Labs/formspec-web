/** @filedesc Structured map of the formspec-engine public API (facades, tests, DI). */
/**
 * Type-level description of everything re-exported from the package entry.
 * Use this to type an injectable bundle, mock, or adapter that mirrors `formspec-engine`.
 *
 * Note: Spec aliases (`FormspecDefinition`, `ValidationReport`, …) and `export type { … }`
 * from `./interfaces.js` are not listed here; import those types directly when needed.
 *
 * @remarks Sub-properties use `typeof import(...)`. TypeDoc models those as internal `__module`
 * symbols; root `typedoc.json` sets `validation.notExported` to `false` so API doc generation
 * does not warn on this pattern.
 */
export interface FormspecEnginePackage {
    /** `FormEngine` class and `createFormEngine` factory. */
    readonly runtime: {
        readonly FormEngine: typeof import('./engine/FormEngine.js').FormEngine;
        readonly createFormEngine: typeof import('./engine/init.js').createFormEngine;
    };
    /** WASM-backed FEL utilities, definition evaluation, schema validation, registry helpers. */
    readonly fel: typeof import('./fel/fel-api.js');
    /** Definition assembly with optional async `$ref` resolution. */
    readonly assembly: typeof import('./assembly/assembleDefinition.js');
    /** Bidirectional mapping DSL runtime. */
    readonly mapping: typeof import('./mapping/RuntimeMappingEngine.js');
    /** Default Preact-signals reactive runtime; swap for custom `EngineReactiveRuntime` implementations. */
    readonly reactivity: {
        readonly preactReactiveRuntime: typeof import('./reactivity/preact-runtime.js').preactReactiveRuntime;
    };
}
