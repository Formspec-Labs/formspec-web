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
  MultiPartyRuntimeConfig,
  MultiPartyRolePolicy,
  RecordLifecycleCorrectablePolicy,
  RecordLifecycleDisputablePolicy,
  RecordLifecyclePolicy,
  RecordLifecycleWindowPolicy,
  RecordLifecycleWithdrawablePolicy,
  SafeAddressAccessClass,
  SafeAddressFieldPolicy,
  SafeAddressRuntimeConfig,
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
 * FW-0038 form-policy walker. EXT-35 is still PROPOSAL, so this accepts the
 * two proposal carriers seen in current design notes:
 *
 * - `definition.extensions['x-formspec-record-lifecycle']`
 * - `definition.governance.recordLifecycle`
 *
 * Returns `'optional'` when any of the three user actions is explicitly
 * enabled. Status-route surfaces synthesize the same optional request at the
 * route boundary because they do not load a Definition.
 */
export function extractRecordLifecycleOptIn(
  definition: FormDefinition,
): FormFeaturePolicyMode | undefined {
  const extensionValue = definition.extensions?.['x-formspec-record-lifecycle'];
  const governanceValue = (definition as { governance?: { recordLifecycle?: unknown } })
    .governance?.recordLifecycle;
  const policy = extractRecordLifecyclePolicy(definition);
  return extensionValue === true ||
    governanceValue === true ||
    recordLifecycleBlockEnablesAnyAction(policy)
    ? 'optional'
    : undefined;
}

export function extractRecordLifecyclePolicy(
  definition: FormDefinition,
): RecordLifecyclePolicy | undefined {
  const extensionValue = definition.extensions?.['x-formspec-record-lifecycle'];
  const governanceValue = (definition as { governance?: { recordLifecycle?: unknown } })
    .governance?.recordLifecycle;
  return (
    parseRecordLifecycleBlock(governanceValue) ??
    parseRecordLifecycleBlock(extensionValue)
  );
}

/**
 * FW-0061 form-policy walker. XS-1/EXT-28 are still PROPOSAL-status, so the
 * runtime accepts the three carriers present in current design notes:
 *
 * - `definition.extensions['x-formspec-multi-party']`
 * - `definition.governance.multiParty`
 * - `definition.parties`
 *
 * The accepted object is the resolved-profile block from FW-0050 §3.3. Any
 * malformed object declines here and is rejected later by resolver validation
 * only when the feature is actually enabled.
 */
export function extractMultiPartyPolicy(
  definition: FormDefinition,
): FormRuntimePolicy | undefined {
  const raw =
    definition.extensions?.['x-formspec-multi-party'] ??
    (definition as { governance?: { multiParty?: unknown } }).governance?.multiParty ??
    (definition as { parties?: unknown }).parties;
  const policy = parseMultiPartyBlock(raw);
  if (!policy) return undefined;
  return {
    features: { multiParty: 'required' },
    limits: { multiParty: policy },
  };
}

function parseMultiPartyBlock(value: unknown): MultiPartyRuntimeConfig | undefined {
  if (value === true || value === false || value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  const tier = block.tier === 'coEqual' || block.tier === 'asymmetric'
    ? block.tier
    : undefined;
  const parties = Array.isArray(block.parties)
    ? block.parties.map(parseMultiPartyRole).filter((party): party is MultiPartyRolePolicy => (
        party !== undefined
      ))
    : [];
  if (!tier || parties.length < 2 || parties.length !== (block.parties as unknown[] | undefined)?.length) {
    return undefined;
  }
  const invitationChannel =
    block.invitationChannel === 'magic-link' ||
    block.invitationChannel === 'wos-task' ||
    block.invitationChannel === 'out-of-band'
      ? block.invitationChannel
      : 'out-of-band';
  const deadlinePolicy = parseMultiPartyDeadlinePolicy(block.deadlinePolicy);
  return {
    tier,
    parties,
    invitationChannel,
    deadlinePolicy,
  };
}

function parseMultiPartyRole(value: unknown): MultiPartyRolePolicy | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  const roleId = nonEmptyString(block.roleId);
  const role =
    block.role === 'coEqual' ||
    block.role === 'asymmetricPrimary' ||
    block.role === 'asymmetricSecondary' ||
    block.role === 'guardianFor'
      ? block.role
      : undefined;
  const cardinality = parseMultiPartyCardinality(block.cardinality);
  if (!roleId || !role || !cardinality) return undefined;
  const visibilityScope =
    block.visibilityScope === 'scoped' || block.visibilityScope === 'shared'
      ? block.visibilityScope
      : 'shared';
  return {
    roleId,
    label: nonEmptyString(block.label),
    role,
    cardinality,
    assuranceFloor: parseAssuranceFloor(block.assuranceFloor),
    visibilityScope,
    visibleTo: stringArray(block.visibleTo),
    editableBy: stringArray(block.editableBy),
    signedBy: stringArray(block.signedBy),
    safeAddressAudience: stringArray(block.safeAddressAudience),
  };
}

function parseMultiPartyCardinality(
  value: unknown,
): MultiPartyRolePolicy['cardinality'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { min: 1, max: 1 };
  }
  const block = value as Record<string, unknown>;
  const min = positiveInteger(block.min) ?? 1;
  const max = block.max === 'unbounded'
    ? 'unbounded'
    : positiveInteger(block.max) ?? min;
  return { min, max };
}

function parseAssuranceFloor(value: unknown): MultiPartyRolePolicy['assuranceFloor'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  const floor = {
    ial: nonEmptyString(block.ial),
    aal: nonEmptyString(block.aal),
    fal: nonEmptyString(block.fal),
  };
  return floor.ial || floor.aal || floor.fal ? floor : undefined;
}

function parseMultiPartyDeadlinePolicy(
  value: unknown,
): MultiPartyRuntimeConfig['deadlinePolicy'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  const expirationAction =
    block.expirationAction === 'convert-to-partial'
      ? 'convert-to-partial'
      : block.expirationAction === 'void-submission'
        ? 'void-submission'
        : undefined;
  if (!expirationAction) return undefined;
  return {
    expirationAction,
    perPartyDeadline: nonEmptyString(block.perPartyDeadline),
  };
}

/**
 * FW-0060 safe-address form-policy walker. While EXT-31/EXT-32 are still
 * PROPOSAL-status this accepts the build-slice extension carrier and also
 * discovers items with `accessControl.class` in the `safe-*` namespace.
 */
export function extractSafeAddressPolicy(
  definition: FormDefinition,
): FormRuntimePolicy | undefined {
  const raw = definition.extensions?.['x-formspec-safe-address'];
  if (raw === false) {
    return { features: { safeAddress: 'forbidden' } };
  }
  const block = parseSafeAddressBlock(raw);
  const fields = [
    ...safeAddressFieldsFromItems(definition.items),
    ...(block.fields ?? []),
  ];
  if (!block.enabled && fields.length === 0) return undefined;
  const config: SafeAddressRuntimeConfig = {
    enabledClasses: block.enabledClasses ?? uniqueSafeClasses(fields),
    receiptPostureTier: block.receiptPostureTier ?? 'phase-1-fallback',
    substituteAddressDirectoryRef:
      block.substituteAddressDirectoryRef ?? 'composition:safeAddressDirectory',
    acpJurisdictionsAccepted: block.acpJurisdictionsAccepted ?? [],
    authorizedAudiences: block.authorizedAudiences ?? ['issuer_verification'],
    fields,
    rendererHints: block.rendererHints,
  };
  return {
    features: {
      safeAddress: block.mode ?? 'required',
    },
    limits: { safeAddress: config },
  };
}

function parseSafeAddressBlock(value: unknown): {
  enabled: boolean;
  mode?: 'optional' | 'required';
  receiptPostureTier?: SafeAddressRuntimeConfig['receiptPostureTier'];
  enabledClasses?: readonly SafeAddressAccessClass[];
  acpJurisdictionsAccepted?: readonly string[];
  authorizedAudiences?: readonly string[];
  substituteAddressDirectoryRef?: string;
  fields?: readonly SafeAddressFieldPolicy[];
  rendererHints?: SafeAddressRuntimeConfig['rendererHints'];
} {
  if (value === true) return { enabled: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { enabled: false };
  }
  const block = value as Record<string, unknown>;
  const mode = block.mode === 'optional' || block.mode === 'required' ? block.mode : undefined;
  return {
    enabled: block.enabled === true || mode !== undefined,
    mode,
    receiptPostureTier:
      block.receiptPostureTier === 'verifier-grade' ||
      block.receiptPostureTier === 'phase-1-fallback'
        ? block.receiptPostureTier
        : undefined,
    enabledClasses: safeClassArray(block.enabledClasses),
    acpJurisdictionsAccepted: stringArray(block.acpJurisdictionsAccepted),
    authorizedAudiences: stringArray(block.authorizedAudiences),
    substituteAddressDirectoryRef: nonEmptyString(block.substituteAddressDirectoryRef),
    fields: safeAddressFieldArray(block.fields),
    rendererHints: parseSafeAddressRendererHints(block.rendererHints),
  };
}

function safeAddressFieldsFromItems(
  items: readonly FormItem[] | undefined,
  ancestors: readonly string[] = [],
): readonly SafeAddressFieldPolicy[] {
  if (!items) return [];
  const fields: SafeAddressFieldPolicy[] = [];
  for (const item of items) {
    const path = `/${[...ancestors, item.key].join('/')}`;
    const accessClass = safeAccessClass(item);
    if (accessClass) {
      fields.push({
        path,
        label: item.label,
        accessClass,
        visibleTo: stringArray((item as { visibleTo?: unknown }).visibleTo),
        plaintextAudiences: stringArray(
          (item.accessControl as { plaintextAudiences?: unknown } | undefined)
            ?.plaintextAudiences,
        ),
        effectiveAudiences: stringArray(
          (item.accessControl as { effectiveAudiences?: unknown } | undefined)
            ?.effectiveAudiences,
        ),
      });
    }
    if (item.type === 'group') {
      fields.push(...safeAddressFieldsFromItems(item.children, [...ancestors, item.key]));
    }
  }
  return fields;
}

function safeAccessClass(item: FormItem): SafeAddressAccessClass | undefined {
  const value = (item.accessControl as { class?: unknown } | undefined)?.class;
  if (value === 'safe-address' || value === 'safe-contact' || value === 'safe-employer') {
    return value;
  }
  return undefined;
}

function safeAddressFieldArray(value: unknown): readonly SafeAddressFieldPolicy[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const fields = value
    .map((entry): SafeAddressFieldPolicy | undefined => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
      const candidate = entry as Record<string, unknown>;
      const accessClass = safeClass(candidate.accessClass);
      const path = nonEmptyString(candidate.path);
      if (!path || !accessClass) return undefined;
      return {
        path,
        label: nonEmptyString(candidate.label),
        accessClass,
        visibleTo: stringArray(candidate.visibleTo),
        plaintextAudiences: stringArray(candidate.plaintextAudiences),
        effectiveAudiences: stringArray(candidate.effectiveAudiences),
      };
    })
    .filter((entry): entry is SafeAddressFieldPolicy => entry !== undefined);
  return fields.length > 0 ? fields : undefined;
}

function parseSafeAddressRendererHints(
  value: unknown,
): SafeAddressRuntimeConfig['rendererHints'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const maskRenderToken = nonEmptyString(candidate.maskRenderToken);
  const revealAffordanceLabel = nonEmptyString(candidate.revealAffordanceLabel);
  if (!maskRenderToken && !revealAffordanceLabel) return undefined;
  return { maskRenderToken, revealAffordanceLabel };
}

function safeClass(value: unknown): SafeAddressAccessClass | undefined {
  if (value === 'safe-address' || value === 'safe-contact' || value === 'safe-employer') {
    return value;
  }
  return undefined;
}

function safeClassArray(value: unknown): readonly SafeAddressAccessClass[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const classes = value.filter((entry): entry is SafeAddressAccessClass => safeClass(entry) !== undefined);
  return classes.length > 0 ? classes : undefined;
}

function uniqueSafeClasses(fields: readonly SafeAddressFieldPolicy[]): readonly SafeAddressAccessClass[] {
  return [...new Set(fields.map((field) => field.accessClass))];
}

function recordLifecycleBlockEnablesAnyAction(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const block = value as RecordLifecyclePolicy;
  return (
    block.correctable?.enabled === true ||
    block.withdrawable?.enabled === true ||
    block.disputable?.enabled === true
  );
}

function parseRecordLifecycleBlock(value: unknown): RecordLifecyclePolicy | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const block = value as Record<string, unknown>;
  const policy: RecordLifecyclePolicy = {
    correctable: parseCorrectablePolicy(block.correctable),
    withdrawable: parseWithdrawablePolicy(block.withdrawable),
    disputable: parseDisputablePolicy(block.disputable),
  };
  return recordLifecycleBlockEnablesAnyAction(policy) ? policy : undefined;
}

function parseCorrectablePolicy(value: unknown): RecordLifecycleCorrectablePolicy | undefined {
  const block = parseActionBlock(value);
  if (!block) return undefined;
  return {
    enabled: block.enabled,
    correctableFieldSet: parseStringArray(block.correctableFieldSet),
    window: parseRecordLifecycleWindow(block.window),
    requiresEvidence: parseBoolean(block.requiresEvidence),
    requiresReason: parseBoolean(block.requiresReason),
  };
}

function parseWithdrawablePolicy(value: unknown): RecordLifecycleWithdrawablePolicy | undefined {
  const block = parseActionBlock(value);
  if (!block) return undefined;
  const partyScope = block.partyScope;
  const preDeterminationKernelMode = block.preDeterminationKernelMode;
  const postDeterminationIntent = block.postDeterminationIntent;
  return {
    enabled: block.enabled,
    window: parseRecordLifecycleWindow(block.window),
    requiresReason: parseBoolean(block.requiresReason),
    preDeterminationKernelMode:
      preDeterminationKernelMode === 'applicant-withdrawn' ? preDeterminationKernelMode : undefined,
    postDeterminationIntent:
      postDeterminationIntent === 'rescission-requested' ? postDeterminationIntent : undefined,
    requiresIssuerAcceptance: parseBoolean(block.requiresIssuerAcceptance),
    partyScope:
      partyScope === 'any-party' || partyScope === 'all-parties-must-agree'
        ? partyScope
        : undefined,
  };
}

function parseDisputablePolicy(value: unknown): RecordLifecycleDisputablePolicy | undefined {
  const block = parseActionBlock(value);
  if (!block) return undefined;
  return {
    enabled: block.enabled,
    window: parseRecordLifecycleWindow(block.window),
    requiresEvidence: parseBoolean(block.requiresEvidence),
    requiresReason: parseBoolean(block.requiresReason),
    signerOnly: parseBoolean(block.signerOnly),
  };
}

function parseActionBlock(value: unknown): (Record<string, unknown> & { enabled: boolean }) | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  if (typeof block.enabled !== 'boolean') return undefined;
  return block as Record<string, unknown> & { enabled: boolean };
}

function parseRecordLifecycleWindow(value: unknown): RecordLifecycleWindowPolicy | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  if (block.state === 'open') return { state: 'open' };
  if (block.state === 'closes-at' && typeof block.closesAt === 'string') {
    return { state: 'closes-at', closesAt: block.closesAt };
  }
  if (block.state === 'closed') {
    return typeof block.closedAt === 'string'
      ? { state: 'closed', closedAt: block.closedAt }
      : { state: 'closed' };
  }
  if (typeof block.closesAt === 'string') {
    return { closesAt: block.closesAt };
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
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
