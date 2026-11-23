/** @filedesc Serialize checkpoints and fence filing actions against one editable form revision. */
import { type ActionRefFinding, type IFormEngine, type ResponseAction, type ResponseActionAsyncInvocationPorts, type ResponseActionEffectDispatchContext, type ResponseActionInvocationPorts, type ResponseActionInvocationResult } from '@formspec-org/engine';
import { type PageSequenceEntry } from '@formspec-org/layout';
import { type DraftFencedAction, type DraftKey, type DraftPort, type DraftRecord } from '@formspec-org/surface';
export type { DraftFencedAction } from '@formspec-org/surface';
import type { ResponseActionInvokerInput, ResponseActionInvokerResult, ResponseActionsDocument, SubmitResult } from '@formspec-org/react';
import type { EffectRequest, FormResponse } from '@formspec-org/types';
import type { SurfaceSaveNotice } from './SurfaceSlot.js';
export type DraftNoticeReporter = (notice: SurfaceSaveNotice, options?: {
    focusConflict?: boolean;
}) => void;
export interface DraftWriterOptions {
    engine: IFormEngine;
    key: DraftKey;
    port: DraftPort;
    initializedRevision?: string | undefined;
    draft?: DraftRecord | undefined;
    creationPins?: DraftRecord['pins'];
    sections: readonly PageSequenceEntry[];
    actions?: ResponseActionsDocument | undefined;
    author?: {
        id: string;
        name?: string;
    } | undefined;
    locally?: boolean | undefined;
    debounceMs?: number | undefined;
    report?: DraftNoticeReporter | undefined;
    onActionFinding?: ((finding: ActionRefFinding) => void) | undefined;
    invoker?: DraftActionInvoker | undefined;
    checkpointPorts?: DraftCheckpointPorts | undefined;
    responseId?: string | undefined;
    /** Wait for an in-flight session review save for this draft key before sending a local checkpoint. */
    waitForReview?: (() => Promise<void> | undefined) | undefined;
}
/** Pass the expected revision through to the durable Prepare, Sign or Submit operation. */
export interface SurfaceDraftFence {
    key: DraftKey;
    definitionVersion: string;
    revision: string;
    responseJson: string;
}
export type DraftActionInvokerResult<T> = ResponseActionInvokerResult<T> & {
    /** The revision committed by the operation when it advances the draft. */
    committedDraftRevision?: string;
};
export type DraftActionInvoker = (input: ResponseActionInvokerInput<SubmitResult> & {
    draftFence?: Readonly<SurfaceDraftFence>;
}) => DraftActionInvokerResult<SubmitResult> | Promise<DraftActionInvokerResult<SubmitResult>>;
/** Supply host preconditions and non-save effects for checkpoint invocations. */
export type DraftCheckpointPorts = (input: ResponseActionInvokerInput<SubmitResult>) => ResponseActionAsyncInvocationPorts<SubmitResult>;
type DraftActionPorts = Omit<ResponseActionInvocationPorts<SubmitResult>, 'dispatchEffect'> & {
    dispatchEffect?: (effect: EffectRequest, detail: SubmitResult, action: ResponseAction, context: ResponseActionEffectDispatchContext & {
        draftFence?: Readonly<SurfaceDraftFence>;
    }) => ReturnType<NonNullable<ResponseActionInvocationPorts<SubmitResult>['dispatchEffect']>>;
};
type DraftActionInput = Omit<ResponseActionInvokerInput<SubmitResult>, 'ports'> & {
    ports: DraftActionPorts;
};
export declare function usesDraftCheckpoint(action: ResponseAction): boolean;
type SavedExplanation = NonNullable<FormResponse['explanations']>[number];
export type CommittedExplanationsReadback = {
    status: 'loaded';
    explanations: readonly SavedExplanation[];
} | {
    status: 'superseded';
} | {
    status: 'unavailable';
};
/** Read back stamped explanations from storage when a port returns a revision-only save reply. */
export declare function readCommittedExplanationsAtRevision(port: DraftPort, key: DraftKey, definitionVersion: string, revision: string, signal?: AbortSignal): Promise<CommittedExplanationsReadback>;
export declare function createDraftWriter(options: DraftWriterOptions): {
    invoke: (input: DraftActionInput, { invoker, current, automatic }?: {
        invoker?: DraftActionInvoker | undefined;
        current?: () => boolean;
        automatic?: boolean;
    }) => Promise<ResponseActionInvocationResult<SubmitResult>>;
    flush: (create?: boolean, automatic?: {
        expectedEdit: number;
        expectedDocument: ResponseActionsDocument | undefined;
        expectedAction: ResponseAction | undefined;
        expectedPolicy: unknown;
        capturedResponse?: FormResponse | undefined;
    }) => Promise<boolean>;
    runFenced: <T>(kind: DraftFencedAction, operation: (draft: Readonly<SurfaceDraftFence>, isCurrent: () => boolean) => Promise<T>, { completed, committedRevision, current, automaticGuard }?: {
        completed?: ((result: T) => boolean) | undefined;
        committedRevision?: ((result: T) => string | undefined) | undefined;
        current?: () => boolean;
        automaticGuard?: {
            expectedEdit: number;
            expectedDocument: ResponseActionsDocument | undefined;
            expectedAction: ResponseAction | undefined;
            expectedPolicy: unknown;
            capturedResponse?: FormResponse | undefined;
        } | undefined;
    }) => Promise<T>;
    resolveConflict: (choice: "load" | "keep") => Promise<boolean | "reopen">;
    captureActionResponse: ({ profile }: Parameters<NonNullable<DraftActionPorts["submit"]>>[0]) => {
        response: FormResponse;
        validationReport: import("@formspec-org/types").ValidationReport | null;
    };
    applyCommittedReview: (fromRevision: string, toRevision: string, baseExplanations: readonly import("@formspec-org/engine").DraftExplanation[], committedExplanations?: readonly SavedExplanation[]) => boolean;
    deferCommittedReview: (fromRevision: string, toRevision: string, baseExplanations: readonly import("@formspec-org/engine").DraftExplanation[], committedAnswers?: readonly import("@formspec-org/engine").DraftExplanation[]) => boolean;
    supersedeCommittedReview: (fromRevision: string, toRevision: string, baseExplanations: readonly import("@formspec-org/engine").DraftExplanation[], committedAnswers?: readonly import("@formspec-org/engine").DraftExplanation[]) => boolean;
    readonly actions: import("@formspec-org/types").ResponseActionsDocument | undefined;
    readonly autosaveFinding: ActionRefFinding | undefined;
    readonly conflict: boolean;
    readonly dirty: boolean;
    readonly revision: string | undefined;
    setActions(nextActions: ResponseActionsDocument | undefined): ActionRefFinding | undefined;
    leave: () => Promise<boolean>;
    waitForSaves: () => Promise<boolean>;
    setMounted(value: boolean): void;
    dispose(): void;
};
export type DraftWriter = ReturnType<typeof createDraftWriter>;
