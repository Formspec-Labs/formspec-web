/**
 * Pure form-policy walker — first non-literal extractor.
 *
 * Co-located in `policy/` (not `composition/`) because the derivation is pure
 * policy logic, not composition wiring. FW-0066 will lift this kind of
 * walker into the `FormRuntimePolicyExtractor` port once two or more
 * extractors exist; today it lives here so the composition factories can
 * compose it inline.
 */
import type { FormDefinition, FormItem } from '@formspec-org/types';
import type { FormFeaturePolicyMode } from './policy-shapes.ts';

/**
 * Returns `'required'` when the definition contains any field with
 * `dataType === 'attachment'` (including nested in repeating groups);
 * returns `undefined` otherwise.
 *
 * The walker treats attachment-bearing forms as requiring the `fileUpload`
 * capability — there is no honest way to render the field without an
 * object-store adapter behind it.
 */
export function extractAttachmentRequirement(
  definition: FormDefinition,
): FormFeaturePolicyMode | undefined {
  return hasAttachmentField(definition.items) ? 'required' : undefined;
}

function hasAttachmentField(items: readonly FormItem[] | undefined): boolean {
  if (!items) return false;
  for (const item of items) {
    if (item.type === 'field' && item.dataType === 'attachment') {
      return true;
    }
    if (item.type === 'group' && hasAttachmentField(item.children)) {
      return true;
    }
  }
  return false;
}
