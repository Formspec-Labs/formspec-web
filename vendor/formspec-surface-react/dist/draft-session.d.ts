/** @filedesc Retain editable draft sessions across browser history and qualify all access by key. */
import { type IFormEngine } from '@formspec-org/engine';
import type { BrowserDraftPort, DataSourceSubject, DraftKey, DraftLoadResult, DraftPort } from '@formspec-org/surface';
import type { FormResponse } from '@formspec-org/types';
import { type DraftCheckpointPorts, type DraftNoticeReporter, type DraftWriter } from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput } from './SurfaceSlot.js';
export interface SurfaceDraftStorage {
    port: DraftPort;
    scope: string;
    author?: {
        id: string;
        name?: string;
    };
}
export declare function deriveDraftSubject(subject: DataSourceSubject | undefined): Promise<DraftKey['subject']>;
type CommittedDraft = {
    status: 'loaded';
    response: FormResponse;
    revision: string;
    key: DraftKey;
} | {
    status: 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed';
};
type DraftOpen = {
    status: 'ready';
    engine: IFormEngine;
    writer: DraftWriter;
} | (Extract<DraftLoadResult, {
    status: 'version-mismatch';
}> & {
    key: DraftKey;
}) | {
    status: 'denied' | 'unavailable' | 'loading';
};
export declare function createDraftSession(storage: SurfaceDraftStorage, browserPort?: BrowserDraftPort, checkpointPorts?: DraftCheckpointPorts): {
    scope: string;
    port: DraftPort;
    restart: ((key: DraftKey, expectedRevision: string) => Promise<import("@formspec-org/surface").DraftRestartResult>) | undefined;
    acquire(key: DraftKey, input: SurfaceDefinitionFormRenderInput, report: DraftNoticeReporter): {
        result: Promise<DraftOpen>;
        release(): void;
    };
    readCommitted(definition: {
        url: string;
        version: string;
    }, subject: DataSourceSubject | undefined, options?: {
        afterPendingSaves?: boolean;
        signal?: AbortSignal;
    }): Promise<CommittedDraft>;
    leave(): Promise<boolean>;
    writerFor(key: DraftKey, version: string): {
        invoke: (input: Omit<import("@formspec-org/react").ResponseActionInvokerInput<import("@formspec-org/react").SubmitResult>, "ports"> & {
            ports: Omit<import("@formspec-org/engine").ResponseActionInvocationPorts<import("@formspec-org/react").SubmitResult>, "dispatchEffect"> & {
                dispatchEffect?: (effect: import("@formspec-org/types").EffectRequest, detail: import("@formspec-org/react").SubmitResult, action: import("@formspec-org/types").Action, context: import("@formspec-org/engine").ResponseActionEffectDispatchContext & {
                    draftFence?: Readonly<import("./draft-writer.js").SurfaceDraftFence>;
                }) => ReturnType<NonNullable<import("@formspec-org/engine").ResponseActionInvocationPorts<import("@formspec-org/react").SubmitResult>["dispatchEffect"]>>;
            };
        }, { invoker, current }?: {
            invoker?: import("./draft-writer.js").DraftActionInvoker | undefined;
            current?: () => boolean;
        }) => Promise<import("@formspec-org/engine").ResponseActionInvocationResult<import("@formspec-org/react").SubmitResult>>;
        flush: (create?: boolean) => Promise<boolean>;
        runFenced: <T>(kind: import("@formspec-org/surface").DraftFencedAction, operation: (draft: Readonly<import("./draft-writer.js").SurfaceDraftFence>, isCurrent: () => boolean) => Promise<T>, { completed, committedRevision, current }?: {
            completed?: ((result: T) => boolean) | undefined;
            committedRevision?: ((result: T) => string | undefined) | undefined;
            current?: () => boolean;
        }) => Promise<T>;
        resolveConflict: (choice: "load" | "keep") => Promise<boolean>;
        captureActionResponse: ({ profile }: Parameters<NonNullable<((options: import("@formspec-org/engine").ResponseActionSubmitOptions) => import("@formspec-org/react").SubmitResult | null) | undefined>>[0]) => {
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
    } | undefined;
    dispose(): void;
};
export type DraftSession = ReturnType<typeof createDraftSession>;
export {};
