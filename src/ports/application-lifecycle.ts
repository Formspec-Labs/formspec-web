import type { DraftKey } from './draft-store.ts';

/** Backend-qualified options for one immutable publication. */
export interface ApplicationLifecycleCapabilities {
  earlyCaseCreation: boolean;
  persistentSaving: boolean;
  formVersionId: string;
}
/** Actual WOS association; draftRef is private and caseReference is display-only. */
export interface ApplicationCaseReceipt {
  caseLedgerId: string;
  caseReference: string;
  draftRef: string;
  status: 'in-progress' | 'submitted';
}
export interface ApplicationLifecycle {
  readonly capabilities: Readonly<ApplicationLifecycleCapabilities>;
  /** Fresh current-owner lookup; never creates a case. */
  load(key: DraftKey): Promise<ApplicationCaseReceipt | undefined>;
  /** Deliberate Start creates or resumes the owned draft association. */
  start(key: DraftKey, operationId: string): Promise<ApplicationCaseReceipt>;
}
