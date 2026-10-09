import type { CompletionLifetime } from './response-completion.ts';
import type { FormResponse } from '@formspec-org/types';
import type { WosResourceUrn } from './status-reader.ts';

/** Exact work-spec API TaskOutcomeEvent vocabulary; schema validation remains required. */
export interface TaskOutcomeEvent {
  readonly taskId: WosResourceUrn;
  readonly processId: WosResourceUrn;
  readonly outcome: 'submitted' | 'completed' | 'dismissed' | 'expired' | 'delegated' | 'escalated' | 'drafted';
  readonly newStatus?: 'pending' | 'drafted' | 'submitted' | 'dismissed' | 'expired';
  readonly actorRef?: string;
  readonly occurredAt: string;
  readonly provenanceRecordRef?: WosResourceUrn;
}
export interface TaskSubmission {
  readonly definitionUrl: string;
  readonly definitionVersion: string;
  readonly response: FormResponse;
}
export type CompletedTaskOutcome = TaskOutcomeEvent & { readonly outcome: 'completed'; readonly newStatus: 'submitted' };

/** Fixed task/publication selection supplied by the owning task launch, never widget input. */
export interface TaskCompletionSelection {
  readonly taskId: WosResourceUrn;
  readonly processId: WosResourceUrn;
  readonly definitionUrl: string;
  readonly definitionVersion: string;
}
export interface TaskCompletion {
  complete(submission: TaskSubmission, operationId: string,
    lifetime: CompletionLifetime): Promise<CompletedTaskOutcome>;
}
