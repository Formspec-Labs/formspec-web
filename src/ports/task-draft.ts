/** Exact selectors returned by Source; they grant no owner or task authority. */
export interface SignedTaskDraft {
  readonly draftId: string;
  readonly expectedSignedDraftVersion: number;
  readonly expectedSignedResponseHash: string;
  readonly associationHash: string;
  readonly taskBindingHash: string;
}

/** CamelCase taskDraft member of Source's otherwise snake_case DraftView. */
export interface TaskDraftAssociation {
  readonly version: 1;
  readonly associationHash: string;
  readonly taskBindingHash: string;
  readonly signedDraft?: SignedTaskDraft;
}

/** Trusted task launch selection; Source independently checks the current task grant and full publication. */
export interface TaskDraftLaunchSelection {
  readonly version: 1;
  readonly taskId: string;
  readonly expectedTaskRevision: string;
  readonly formVersionId: string;
  readonly formVersionHash: string;
}
