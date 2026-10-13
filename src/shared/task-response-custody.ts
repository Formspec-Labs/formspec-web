import canonicalize from 'canonicalize';
import type { FormDefinition, FormItem } from '@formspec-org/types';
import type { SavedResponseDraft } from '../ports/response-signing.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Indexed repeat rows have no public stable identity for attaching unknown members. */
function assertModeledGroups(items: readonly FormItem[], data: Record<string, unknown>): void {
  for (const item of items) {
    if (item.type !== 'group' || !Object.hasOwn(data, item.key)) continue;
    const children = item.children ?? [];
    const keys = new Set(children.filter(child => child.type !== 'display').map(child => child.key));
    const values = item.repeatable ? Array.isArray(data[item.key]) ? data[item.key] : [] : [data[item.key]];
    for (const value of values as unknown[]) {
      if (!record(value)) continue;
      if (Object.keys(value).some(key => !keys.has(key))) throw new Error('native-task-custody-nested-unsupported');
      assertModeledGroups(children, value);
    }
  }
}

/** Only a previously verified task checkpoint supplies custody; this is not an owner validator. */
export function assertTaskResponseCustody(definition: FormDefinition, saved: SavedResponseDraft): void {
  if (!saved.evidence.taskDraft) throw new Error('native-task-custody-evidence-unavailable');
  assertModeledGroups(definition.items, saved.response.data);
}

/** Authored roots stay entirely engine-owned. Opaque task roots stay exactly in native custody. */
export function assembleTaskResponseData(definition: FormDefinition, data: Record<string, unknown>, saved: SavedResponseDraft): Record<string, unknown> {
  assertTaskResponseCustody(definition, saved);
  const modeled = new Set(definition.items.map(item => item.key));
  const baseline = saved.response.data;
  for (const key of Object.keys(data)) {
    if (!modeled.has(key) && (!Object.hasOwn(baseline, key) || canonicalize(data[key]) !== canonicalize(baseline[key])))
      throw new Error('native-task-custody-conflict');
  }
  const opaque = Object.entries(baseline).filter(([key]) => !modeled.has(key));
  return structuredClone(Object.fromEntries([...Object.entries(data).filter(([key]) => modeled.has(key)), ...opaque]));
}
