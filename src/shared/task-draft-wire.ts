import type { SignedTaskDraft, TaskDraftAssociation } from '../ports/task-draft.ts';

/** Exact selectors from an authenticated Source read or Sign result, never a task grant.
 * Source qualifies the retained Sign record; WOS independently admits completion. */
export function assertSignedTaskDraft(association: TaskDraftAssociation | undefined,
  draft: { id: string; version: number; responseHash: string }): SignedTaskDraft {
  assertTaskDraftWire(association);
  const signed = association?.signedDraft;
  if (!signed || Object.keys(signed).sort().join(',') !== 'associationHash,draftId,expectedSignedDraftVersion,expectedSignedResponseHash,taskBindingHash'
    || signed.draftId !== draft.id || !Number.isSafeInteger(signed.expectedSignedDraftVersion)
    || signed.expectedSignedDraftVersion !== draft.version || draft.version < 2
    || !/^[a-f0-9]{64}$/.test(draft.responseHash) || signed.expectedSignedResponseHash !== `sha256:${draft.responseHash}`
    || signed.associationHash !== association!.associationHash || signed.taskBindingHash !== association!.taskBindingHash)
    throw new Error('Signed task draft selector differs from its owned snapshot');
  return signed;
}

/** Optional authenticated composition metadata; never a freshness or write grant. */
export function assertTaskDraftWire(value: TaskDraftAssociation | undefined): void {
  if (value === undefined) return;
  if (value.version !== 1 || !/^sha256:[a-f0-9]{64}$/.test(value.associationHash)
    || !/^sha256:[a-f0-9]{64}$/.test(value.taskBindingHash)) throw new Error('Invalid task draft association');
  const prefill = value.taskPrefill;
  if (prefill === undefined) return;
  if (!prefill || Object.keys(prefill).sort().join(',') !== 'editableDataPaths,readOnlyDataPaths,version' || prefill.version !== 1)
    throw new Error('Invalid task prefill metadata');
  const seen = new Set<string>();
  for (const paths of [prefill.editableDataPaths, prefill.readOnlyDataPaths]) {
    if (!Array.isArray(paths) || paths.length > 128) throw new Error('Invalid task prefill metadata');
    for (const path of paths) {
      if (typeof path !== 'string' || path.length < 2 || new TextEncoder().encode(path).length > 1024
        || !/^\/(?:[^~/]|~[01])+$/.test(path) || seen.has(path)) throw new Error('Invalid task prefill metadata');
      seen.add(path);
      if (seen.size > 128) throw new Error('Invalid task prefill metadata');
    }
  }
}
