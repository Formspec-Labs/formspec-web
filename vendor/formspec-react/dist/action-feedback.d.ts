/** @filedesc Private provider feedback with one originating form-content outlet. */
import { type ReactNode } from 'react';
import { type IFormEngine, type ResponseActionInvocationResult } from '@formspec-org/engine';
import { type ChromeText } from './use-chrome-text.js';
type Status = ResponseActionInvocationResult<unknown>['status'];
export type ActionFeedback = {
    phase: 'idle';
} | {
    phase: 'pending';
    intent?: string;
} | {
    phase: 'settled';
    status: Status;
    intent: string | undefined;
};
export declare function actionResultMessage(chrome: ChromeText, feedback: ActionFeedback): string;
interface Ticket {
    token: number;
    generation: number;
    epoch: number;
    outlet: string;
}
type OwnedFeedback = {
    ticket: Ticket;
    anchors: readonly string[];
    feedback: ActionFeedback;
} | undefined;
/** No response, payload, findings, translated copy or saved flag enters this store. */
export declare function createActionFeedbackStore(engine: IFormEngine): {
    state: import("@preact/signals-core").Signal<OwnedFeedback>;
    connect(): () => void;
    register(outlet: string): () => void;
    start(outlet: string, intent: string | undefined, candidates: readonly string[], source?: HTMLElement | null): Ticket | undefined;
    recoverFocus(ticket: Ticket, target: HTMLElement): void;
    settle(ticket: Ticket | undefined, status: Status): void;
};
type FeedbackStore = ReturnType<typeof createActionFeedbackStore>;
export declare function ActionFeedbackProvider({ engine, responseId, renderInstanceId, children }: {
    engine: IFormEngine;
    responseId?: string;
    renderInstanceId?: string;
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useActionFeedbackOutlet(): {
    id: string;
    store: FeedbackStore;
} | undefined;
/** The outlet lives outside recursive When branches and announces only its origin. */
export declare function ActionFeedbackContent({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};
