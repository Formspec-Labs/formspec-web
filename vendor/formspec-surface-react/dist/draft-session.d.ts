/** @filedesc Retain editable draft sessions across browser history and qualify all access by key. */
import { type ActionRefFinding, type IFormEngine } from '@formspec-org/engine';
import { type PageSequenceEntry } from '@formspec-org/layout';
import type { BrowserDraftPort, DataSourceSubject, DraftKey, DraftLoadResult, DraftPort, DraftRecord, MatchedFilingObservation } from '@formspec-org/surface';
import type { FormDefinition, FormResponse, ResponseSelector } from '@formspec-org/types';
import { type DraftCheckpointPorts, type DraftNoticeReporter, type DraftWriter } from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput } from './SurfaceSlot.js';
export interface SurfaceDraftStorage {
    port: DraftPort;
    responses?: ResponseSelector | undefined;
    definitions?: ReadonlyMap<string, FormDefinition> | undefined;
    scope: string;
    author?: {
        id: string;
        name?: string;
    };
}
/** Key a draft by Core's filing-unit id; runtime WASM only. */
export declare function deriveDraftSubject(subject: DataSourceSubject | undefined): Promise<DraftKey['subject']>;
export type FiledObservation = Extract<MatchedFilingObservation, {
    receiptRef: string;
}>;
type CommittedDraft = {
    status: 'loaded';
    response: FormResponse;
    pins?: DraftRecord['pins'];
    revision: string;
    key: DraftKey;
} | {
    status: 'initialized' | 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed';
};
type CommittedFiling = {
    status: 'loaded';
    response: FormResponse;
    definitionVersion: string;
    observation: FiledObservation;
    key: DraftKey;
} | {
    status: 'absent' | 'denied' | 'unavailable';
};
type DraftOpen = {
    status: 'ready';
    engine: IFormEngine;
    writer: DraftWriter;
    filing?: FiledObservation;
} | {
    status: 'filed';
    filing: FiledObservation;
    response: FormResponse;
    canRevise: boolean;
} | (Extract<DraftLoadResult, {
    status: 'version-mismatch';
}> & {
    key: DraftKey;
}) | {
    status: 'pin-unavailable';
    instance: string;
    prerequisiteTitle?: string;
    requiresAccepted?: boolean;
} | {
    status: 'denied' | 'unavailable' | 'loading';
};
export declare function createDraftSession(storage: SurfaceDraftStorage, browserPort?: BrowserDraftPort, checkpointPorts?: DraftCheckpointPorts): {
    scope: string;
    port: DraftPort;
    definitions: ReadonlyMap<string, FormDefinition> | undefined;
    restart: ((key: DraftKey, expectedRevision: string) => Promise<import("@formspec-org/surface").DraftRestartResult>) | undefined;
    acquire(key: DraftKey, input: SurfaceDefinitionFormRenderInput, report: DraftNoticeReporter, onReopen?: () => void, options?: {
        allowReviseFiled?: boolean;
    }): {
        result: Promise<DraftOpen>;
        setActions(nextActions: SurfaceDefinitionFormRenderInput["responseActionsDocument"]): ActionRefFinding | undefined;
        release(): void;
    };
    readCommitted(definition: {
        url: string;
        version: string;
    }, subject: DataSourceSubject | undefined, options?: {
        afterPendingSaves?: boolean;
        signal?: AbortSignal;
    }): Promise<CommittedDraft>;
    readFiling(definition: {
        url: string;
        version: string;
    }, subject: DataSourceSubject | undefined, options?: {
        signal?: AbortSignal;
    }): Promise<CommittedFiling>;
    resolveReads(definition: FormDefinition, key: DraftKey, pins: DraftRecord["pins"] | undefined, signal?: AbortSignal): Promise<Readonly<Record<string, import("@formspec-org/types").ResponseSelectionDelivery>>>;
    acknowledgeWarningGroup({ definition, subject, expectedRevision, expectedBasis, code, sections, report, }: {
        definition: FormDefinition;
        subject: DataSourceSubject | undefined;
        expectedRevision: string;
        expectedBasis: string;
        code: string;
        sections?: readonly PageSequenceEntry[] | undefined;
        report?: DraftNoticeReporter | undefined;
    }): Promise<"saved" | "mismatch" | "failed">;
    leave(): Promise<boolean>;
    discardForReopen(writer: DraftWriter): void;
    writerFor(key: DraftKey, version: string): {
        invoke: (input: Omit<import("@formspec-org/react").ResponseActionInvokerInput<import("@formspec-org/react").SubmitResult>, "ports"> & {
            ports: Omit<import("@formspec-org/engine").ResponseActionInvocationPorts<import("@formspec-org/react").SubmitResult>, "dispatchEffect"> & {
                dispatchEffect?: (effect: import("@formspec-org/types").EffectRequest, detail: import("@formspec-org/react").SubmitResult, action: import("@formspec-org/types").Action, context: import("@formspec-org/engine").ResponseActionEffectDispatchContext & {
                    draftFence?: Readonly<import("./draft-writer.js").SurfaceDraftFence>;
                }) => ReturnType<NonNullable<import("@formspec-org/engine").ResponseActionInvocationPorts<import("@formspec-org/react").SubmitResult>["dispatchEffect"]>>;
            };
        }, { invoker, current, automatic }?: {
            invoker?: import("./draft-writer.js").DraftActionInvoker | undefined;
            current?: () => boolean;
            automatic?: boolean;
        }) => Promise<import("@formspec-org/engine").ResponseActionInvocationResult<import("@formspec-org/react").SubmitResult>>;
        flush: (create?: boolean, automatic?: {
            expectedEdit: number;
            expectedDocument: import("@formspec-org/react").ResponseActionsDocument | undefined;
            expectedAction: import("@formspec-org/types").Action | undefined;
            expectedPolicy: unknown;
            capturedResponse?: FormResponse | undefined;
        }) => Promise<boolean>;
        runFenced: <T>(kind: import("@formspec-org/surface").DraftFencedAction, operation: (draft: Readonly<import("./draft-writer.js").SurfaceDraftFence>, isCurrent: () => boolean) => Promise<T>, { completed, committedRevision, current, automaticGuard }?: {
            completed?: ((result: T) => boolean) | undefined;
            committedRevision?: ((result: T) => string | undefined) | undefined;
            current?: () => boolean;
            automaticGuard?: {
                expectedEdit: number;
                expectedDocument: import("@formspec-org/react").ResponseActionsDocument | undefined;
                expectedAction: import("@formspec-org/types").Action | undefined;
                expectedPolicy: unknown;
                capturedResponse?: FormResponse | undefined;
            } | undefined;
        }) => Promise<T>;
        resolveConflict: (choice: "load" | "keep") => Promise<boolean | "reopen">;
        captureActionResponse: ({ profile }: Parameters<NonNullable<((options: import("@formspec-org/engine").ResponseActionSubmitOptions) => import("@formspec-org/react").SubmitResult | null) | undefined>>[0]) => {
            response: FormResponse;
            validationReport: import("@formspec-org/types").ValidationReport | null;
        };
        applyCommittedReview: (fromRevision: string, toRevision: string, baseExplanations: readonly import("@formspec-org/engine").DraftExplanation[], committedExplanations?: readonly import("@formspec-org/types").Explanation[]) => boolean;
        deferCommittedReview: (fromRevision: string, toRevision: string, baseExplanations: readonly import("@formspec-org/engine").DraftExplanation[], committedAnswers?: readonly import("@formspec-org/engine").DraftExplanation[]) => boolean;
        supersedeCommittedReview: (fromRevision: string, toRevision: string, baseExplanations: readonly import("@formspec-org/engine").DraftExplanation[], committedAnswers?: readonly import("@formspec-org/engine").DraftExplanation[]) => boolean;
        readonly actions: import("@formspec-org/types").ResponseActionsDocument | undefined;
        readonly autosaveFinding: ActionRefFinding | undefined;
        readonly conflict: boolean;
        readonly dirty: boolean;
        readonly revision: string | undefined;
        setActions(nextActions: import("@formspec-org/react").ResponseActionsDocument | undefined): ActionRefFinding | undefined;
        leave: () => Promise<boolean>;
        waitForSaves: () => Promise<boolean>;
        setMounted(value: boolean): void;
        dispose(): void;
    } | undefined;
    syncActions(writer: DraftWriter, actions: SurfaceDefinitionFormRenderInput["responseActionsDocument"]): ActionRefFinding | undefined;
    dispose(): void;
};
export type DraftSession = ReturnType<typeof createDraftSession>;
export {};
