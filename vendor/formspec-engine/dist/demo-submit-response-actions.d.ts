/** @filedesc Factory for demo/story Response Actions documents with a submit Action. */
import type { ResponseActionsDocumentInput } from './response-actions.js';
export interface DemoSubmitResponseActionsOptions {
    /** Definition url for `targetDefinition` binding. */
    definitionUrl: string;
    /** Action id; default `'submit'`. */
    actionId?: string;
    /**
     * When true (default), override the master-table submit tuple with
     * `(on-submit, non-blocking, none)` so `formspec-submit` hostEvent fires
     * even when validation fails — required for demo `onSubmit` error UX.
     * When false, inherit master-table submit semantics (`block-on-error`).
     */
    emitOnValidationError?: boolean;
}
/** Build a minimal Response Actions sidecar for demos, stories, and test fixtures. */
export declare function createDemoSubmitResponseActions(options: DemoSubmitResponseActionsOptions): ResponseActionsDocumentInput;
