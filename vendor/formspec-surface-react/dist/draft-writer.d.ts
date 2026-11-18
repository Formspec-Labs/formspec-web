/** @filedesc Serialize checkpoints and fence filing actions against one editable form revision. */
import { type IFormEngine, type ResponseAction, type ResponseActionAsyncInvocationPorts, type ResponseActionEffectDispatchContext, type ResponseActionInvocationPorts } from '@formspec-org/engine';
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
    draft?: DraftRecord | undefined;
    sections: readonly PageSequenceEntry[];
    actions?: ResponseActionsDocument | undefined;
    author?: {
        id: string;
        name?: string;
    } | undefined;
    locally?: boolean | undefined;
    debounceMs?: number | undefined;
    report?: DraftNoticeReporter | undefined;
    invoker?: DraftActionInvoker | undefined;
    checkpointPorts?: DraftCheckpointPorts | undefined;
    responseId?: string | undefined;
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
export declare function createDraftWriter(options: DraftWriterOptions): {
    invoke: (input: DraftActionInput, { invoker, current }?: {
        invoker?: DraftActionInvoker | undefined;
        current?: () => boolean;
    }) => Promise<import("@formspec-org/engine").ResponseActionInvocationResult<SubmitResult>>;
    flush: (create?: boolean) => Promise<boolean>;
    runFenced: <T>(kind: DraftFencedAction, operation: (draft: Readonly<SurfaceDraftFence>, isCurrent: () => boolean) => Promise<T>, { completed, committedRevision, current }?: {
        completed?: ((result: T) => boolean) | undefined;
        committedRevision?: ((result: T) => string | undefined) | undefined;
        current?: () => boolean;
    }) => Promise<T>;
    resolveConflict: (choice: "load" | "keep") => Promise<boolean>;
    captureActionResponse: ({ profile }: Parameters<NonNullable<DraftActionPorts["submit"]>>[0]) => {
        response: FormResponse;
        validationReport: import("@formspec-org/types").ValidationReport | null;
    };
    readonly conflict: boolean;
    readonly dirty: boolean;
    readonly revision: string | undefined;
    leave: () => Promise<boolean>;
    waitForSaves: () => Promise<boolean>;
    setMounted(value: boolean): void;
    dispose(): void;
};
export type DraftWriter = ReturnType<typeof createDraftWriter>;
