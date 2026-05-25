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
import type { Money } from '../ports/payment-rail-adapter.ts';
import type {
  FormFeaturePolicyMode,
  FormRuntimePolicy,
  TrustedReviewerRuntimeConfig,
} from './policy-shapes.ts';

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

/**
 * FW-0027 form-policy walker. Returns `'required'` when the definition
 * declares `extensions['x-formspec-payment-required']: true`; returns
 * `undefined` otherwise. Any non-boolean / non-`true` value declines.
 *
 * `'required'` not `'optional'` — see design §"Decision: required, not
 * optional": a fee-bearing form on an instance with no payment rail cannot
 * be honestly submitted; declaring `'required'` fails the form at load with
 * `UnsupportedRequiredFeatureError` and the plain-language unavailable copy,
 * rather than letting the respondent reach the submit button on a broken
 * payment path.
 */
export function extractPaymentRequirement(
  definition: FormDefinition,
): FormFeaturePolicyMode | undefined {
  const value = definition.extensions?.['x-formspec-payment-required'];
  return value === true ? 'required' : undefined;
}

/**
 * FW-0040 form-policy walker. Returns `'optional'` when the definition
 * declares `extensions['x-formspec-embeddable']: true`; returns `undefined`
 * otherwise. Any non-boolean / non-`true` value declines.
 *
 * `'optional'` not `'required'` — see design §"Optional, not required":
 * an embeddable form still mounts directly on its issuer's URL. The
 * iframe-context gate fires at runtime when the form actually loads inside
 * an iframe; declaring `required` would fail-load every embeddable form
 * accessed directly.
 */
export function extractEmbeddableOptIn(
  definition: FormDefinition,
): FormFeaturePolicyMode | undefined {
  const value = definition.extensions?.['x-formspec-embeddable'];
  return value === true ? 'optional' : undefined;
}

/**
 * FW-0027 amount walker. Returns the well-formed `Money` value when the
 * definition declares `extensions['x-formspec-payment-amount']` with an
 * integer `amountMinorUnits` and a non-empty `currency`; returns `undefined`
 * otherwise. The runtime reads this at submit time to drive
 * `PaymentRailAdapter.authorize(amount, ...)`.
 *
 * Slice 1 ships a literal fixed amount per form. FEL-evaluated dynamic
 * amounts that depend on response field values are FW-0097.
 */
export function extractPaymentAmount(
  definition: FormDefinition,
): Money | undefined {
  const raw = definition.extensions?.['x-formspec-payment-amount'];
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as { amountMinorUnits?: unknown; currency?: unknown };
  if (typeof candidate.amountMinorUnits !== 'number') return undefined;
  if (!Number.isInteger(candidate.amountMinorUnits)) return undefined;
  if (candidate.amountMinorUnits < 0) return undefined;
  if (typeof candidate.currency !== 'string' || candidate.currency.length === 0) {
    return undefined;
  }
  return {
    amountMinorUnits: candidate.amountMinorUnits,
    currency: candidate.currency,
  };
}

/**
 * FW-0113 trusted-reviewer form-policy walker. Reads
 * `extensions['x-formspec-trusted-reviewer']` while SC-6 is still
 * PROPOSAL-status:
 *
 * - `true` means comment-allowed optional reviewer sharing.
 * - `{ posture: "comment-allowed" | "suggest-allowed" }` enables the
 *   optional feature and carries the flat FW-0042 resolved-profile block.
 * - `{ posture: "forbidden" }` declares a form-level forbid.
 */
export function extractTrustedReviewerPolicy(
  definition: FormDefinition,
): FormRuntimePolicy | undefined {
  const raw = definition.extensions?.['x-formspec-trusted-reviewer'];
  if (raw === undefined || raw === false) return undefined;
  if (raw === true) {
    return {
      features: { trustedReviewer: 'optional' },
      limits: {
        trustedReviewer: defaultTrustedReviewerConfig('comment-allowed'),
      },
    };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const candidate = raw as {
    posture?: unknown;
    allowedRoles?: unknown;
    reviewerAssuranceFloor?: unknown;
    maxActiveSharesPerDraft?: unknown;
    defaultShareExpiresAtRule?: unknown;
    respondentOnlyFieldPointers?: unknown;
  };
  const posture = trustedReviewerPosture(candidate.posture);
  if (!posture) return undefined;
  const config: TrustedReviewerRuntimeConfig = {
    ...defaultTrustedReviewerConfig(posture),
    allowedRoles: stringArray(candidate.allowedRoles),
    reviewerAssuranceFloor: reviewerAssuranceFloor(candidate.reviewerAssuranceFloor),
    maxActiveSharesPerDraft: positiveInteger(candidate.maxActiveSharesPerDraft),
    defaultShareExpiresAtRule: nonEmptyString(candidate.defaultShareExpiresAtRule),
    respondentOnlyFieldPointers: stringArray(candidate.respondentOnlyFieldPointers) ?? [],
  };
  return {
    features: {
      trustedReviewer: posture === 'forbidden' ? 'forbidden' : 'optional',
    },
    limits: { trustedReviewer: config },
  };
}

function defaultTrustedReviewerConfig(
  posture: TrustedReviewerRuntimeConfig['posture'],
): TrustedReviewerRuntimeConfig {
  return {
    posture,
    respondentOnlyFieldPointers: [],
    reviewerSessionBindingRef: 'composition:reviewerSession',
    reviewThreadStoreBindingRef: 'composition:reviewThreadStore',
  };
}

function trustedReviewerPosture(value: unknown): TrustedReviewerRuntimeConfig['posture'] | undefined {
  if (
    value === 'forbidden' ||
    value === 'comment-allowed' ||
    value === 'suggest-allowed'
  ) {
    return value;
  }
  return undefined;
}

function reviewerAssuranceFloor(
  value: unknown,
): TrustedReviewerRuntimeConfig['reviewerAssuranceFloor'] | undefined {
  if (value === 'L1' || value === 'L2' || value === 'L3' || value === 'L4') {
    return value;
  }
  return undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => (
    typeof entry === 'string' && entry.length > 0
  ));
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
