/** @filedesc FormViewModel — form-level locale-resolved reactive state. */
import type { EngineReactiveRuntime, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleStore } from './locale.js';
export interface FormViewModel {
    readonly title: ReadonlyEngineSignal<string>;
    readonly description: ReadonlyEngineSignal<string>;
    pageTitle(pageId: string): ReadonlyEngineSignal<string>;
    pageDescription(pageId: string): ReadonlyEngineSignal<string>;
    readonly isValid: ReadonlyEngineSignal<boolean>;
    readonly validationSummary: ReadonlyEngineSignal<{
        errors: number;
        warnings: number;
        infos: number;
    }>;
}
export interface FormViewModelDeps {
    rx: EngineReactiveRuntime;
    localeStore: LocaleStore;
    /** Returns definition.title */
    getDefinitionTitle: () => string;
    /** Returns definition.description */
    getDefinitionDescription: () => string | undefined;
    /** Returns page title from theme pages array */
    getPageTitle: (pageId: string) => string | undefined;
    /** Returns page description from theme pages */
    getPageDescription: (pageId: string) => string | undefined;
    /** Evaluates a FEL expression in the form-level (global) context */
    evalFEL: (expr: string) => import('./wasm-bridge-runtime.js').FelEvalResult | unknown;
    /** Returns total validation error/warning/info counts */
    getValidationCounts: () => {
        errors: number;
        warnings: number;
        infos: number;
    };
    /** Returns whether form is valid (no errors) */
    getIsValid: () => boolean;
}
export declare function createFormViewModel(deps: FormViewModelDeps): FormViewModel;
