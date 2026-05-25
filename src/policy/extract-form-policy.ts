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

/**
 * FW-0044 form-policy walker. Returns `'optional'` when the definition
 * declares `extensions['x-formspec-offline-submit']: true`; returns
 * `undefined` otherwise. Any non-boolean / non-`true` value (false, "yes",
 * undefined, omitted) declines.
 *
 * `'optional'` not `'required'` — see design §"Optional, not required":
 * forms that want offline support work fine ONLINE without a queue; the
 * extractor declares an opt-in, not a hard requirement. The resolver
 * disables the feature with `optional-no-instance` when the instance
 * cannot satisfy it; the form still loads.
 */
export function extractOfflineSubmitOptIn(
  definition: FormDefinition,
): FormFeaturePolicyMode | undefined {
  const value = definition.extensions?.['x-formspec-offline-submit'];
  return value === true ? 'optional' : undefined;
}
