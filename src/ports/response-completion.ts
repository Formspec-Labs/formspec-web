import type { RuntimeRequest } from '@formspec-org/types';
import type { SignedResponseSigning } from './response-signing.ts';
import type { SubmitConfirmation } from './submit-transport.ts';
import type { CompletedTaskOutcome } from './task-completion.ts';

export interface CompletionLifetime {
  readonly signal: AbortSignal;
  /** Owner-supplied synchronous check, repeated after every asynchronous wait. */
  readonly assertCurrent: () => void;
}
export interface CaptureResponseCompletion {
  readonly signed: SignedResponseSigning;
  readonly request: RuntimeRequest;
  readonly invocationInput: Readonly<Record<string, unknown>>;
}
/** Only the creating strategy can execute this preparation; implementations retain identity privately. */
export interface PreparedResponseCompletion { readonly kind: 'intake' | 'task' }
export type ResponseCompletionResult =
  | { readonly kind: 'intake'; readonly confirmation: SubmitConfirmation; readonly evidence: { readonly response_id: string; readonly status: SubmitConfirmation['status'] } }
  | { readonly kind: 'task'; readonly outcome: CompletedTaskOutcome; readonly evidence: CompletedTaskOutcome };

/** Trusted adapter strategy; authored requests select no transport or execution authority. */
export interface ResponseCompletion {
  readonly kind: PreparedResponseCompletion['kind'];
  admit(request: RuntimeRequest): void;
  capture(input: CaptureResponseCompletion, lifetime: CompletionLifetime): Promise<PreparedResponseCompletion>;
  complete(prepared: PreparedResponseCompletion, operationId: string, lifetime: CompletionLifetime): Promise<ResponseCompletionResult>;
}

/** Admission failures preserve the shared controller's public refusal vocabulary. */
export class ResponseCompletionRefusal extends Error {
  constructor(readonly code: 'action-unadmitted' | 'outputs-unsupported' | 'context-mismatch') { super(code); }
}
