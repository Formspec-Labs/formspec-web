import canonicalize from 'canonicalize';
import type { FormDefinition } from '@formspec-org/types';
import type { SavedResponseDraft } from '../ports/response-signing.ts';
import { assertTaskDraftWire } from './task-draft-wire.ts';

const own = (value: object, key: string) => Object.hasOwn(value, key);
const decode = (path: string) => path.slice(1).replace(/~1/g, '/').replace(/~0/g, '~');
/** Assemble only the admitted flat task partition from an authoritative saved checkpoint. */
export function assembleNativeTaskPrefill(definition: FormDefinition, saved: SavedResponseDraft, data: Record<string, unknown>): Record<string, unknown> {
  const association = saved.evidence.taskDraft;
  assertTaskDraftWire(association);
  const prefill = association?.taskPrefill;
  if (!prefill) return data;
  const fields = definition.items.filter(item => item.type === 'field');
  if (definition.items.some(item => item.type !== 'field' && item.type !== 'display') || fields.some(item => item.repeatable || item.children !== undefined)) throw new Error('Unsupported task prefill Definition');
  const declared = new Set(fields.map(item => item.key));
  if (declared.size !== fields.length || new Set(definition.items.map(item => item.key)).size !== definition.items.length) throw new Error('Unsupported task prefill Definition');
  const paths = [...prefill.editableDataPaths, ...prefill.readOnlyDataPaths].map(decode);
  if (paths.length !== declared.size || paths.some(key => !declared.has(key))) throw new Error('Task prefill partition differs from Definition');
  const baseline = saved.response.data;
  if (Object.keys(baseline).some(key => !declared.has(key)) || Object.keys(data).some(key => !declared.has(key))) throw new Error('Task prefill data differs from Definition');
  const editable = new Set(prefill.editableDataPaths.map(decode));
  for (const field of fields) {
    const readonly: unknown = field.readonly;
    if (readonly !== undefined && readonly !== true && readonly !== false) throw new Error('Unsupported task prefill Definition');
    if (readonly === true && editable.has(field.key)) throw new Error('Task prefill editable partition includes readonly field');
  }
  for (const bind of definition.binds ?? []) {
    if (bind.readonly === 'true' && editable.has(bind.path)) throw new Error('Task prefill editable partition includes readonly field');
  }
  const result = structuredClone(data);
  for (const key of prefill.readOnlyDataPaths.map(decode)) {
    if (own(data, key) && (!own(baseline, key) || canonicalize(data[key]) !== canonicalize(baseline[key])))
      throw new Error('Task prefill protected value differs');
    if (own(baseline, key)) Object.defineProperty(result, key, { value: structuredClone(baseline[key]), enumerable: true, writable: true, configurable: true });
    else delete result[key];
  }
  return result;
}
