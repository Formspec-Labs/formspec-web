import type {
  FormDefinition,
  FormResponse,
  IntakeHandoff,
  ValidationReport,
} from '@formspec-org/types';
import type { IFormEngine } from '@formspec-org/engine';
import type { IdentityPolicyConfig } from '../config/types.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type {
  AssuranceLevel,
  IdentityClaim,
  IdpOption,
} from '../ports/identity-provider.ts';
import type {
  OfflineSubmitQueue,
  QueuedSubmit,
} from '../ports/offline-submit-queue.ts';
import type {
  Authorization,
  CaptureReceipt,
  PaymentRailAdapter,
} from '../ports/payment-rail-adapter.ts';
import type { EmbedTransport } from '../ports/embed-transport.ts';
import type {
  SubmitConfirmation,
  SubmitTransport,
} from '../ports/submit-transport.ts';
import { extractPaymentAmount } from '../policy/extract-form-policy.ts';
import {
  EmbedOriginNotAllowedError,
  getEmbedLimits,
  type OrgRuntimePolicy,
  type ResolvedMultiPartyPolicy,
  type ResolvedRuntimeProfile,
} from '../policy/index.ts';
import {
  assertUuidV7IdempotencyKey,
  deriveUuidV7FromString,
  type IdempotencyKey,
} from '../shared/idempotency-key.ts';

export function hydrateEngineFromResponse(engine: IFormEngine, response?: FormResponse): void {
  if (!response) {
    return;
  }
  hydrateEngineFromData(engine, response.data);
}

export function hydrateEngineFromData(engine: IFormEngine, data: Record<string, unknown>, prefix = ''): void {
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      const currentCount = engine.repeats[path]?.value ?? 0;
      for (let index = currentCount; index < value.length; index += 1) {
        engine.addRepeatInstance(path);
      }
      value.forEach((entry, index) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          hydrateEngineFromData(engine, entry as Record<string, unknown>, `${path}[${index}]`);
        }
      });
      continue;
    }

    if (value && typeof value === 'object') {
      hydrateEngineFromData(engine, value as Record<string, unknown>, path);
      continue;
    }

    engine.setValue(path, value as Parameters<IFormEngine['setValue']>[1]);
  }
}

export function selectBootIdentityOption(
  options: readonly IdpOption[],
  pickerWillRender = false,
): IdpOption | undefined {
  // FW-0028: when the picker is about to render (deployment offers a real
  // choice AND the policy displays it), do NOT auto-select anonymous — the
  // user picks. When the picker is suppressed (demo mode, oidc-required
  // mode with no OIDC options, or only one option), auto-select anonymous
  // if present so demo / zero-config flows are unchanged.
  if (pickerWillRender) return undefined;
  return options.find((option) => option.kind === 'anonymous');
}

export function signInOptionsForIdentityPolicy({
  options,
  identityMode,
  runtimeMode,
}: {
  options: readonly IdpOption[];
  identityMode: IdentityPolicyConfig['mode'];
  runtimeMode: 'demo' | 'production';
}): IdpOption[] {
  if (runtimeMode !== 'production') return [];
  if (identityMode === 'oidc-required') {
    return options.filter((option) => option.kind === 'oidc');
  }
  // FW-0028: anonymous-allowed picker rule. The picker renders when EITHER
  // the deployment offers a real choice (multiple options) OR the single
  // available option requires explicit user action (OIDC redirect, magic
  // link request, passkey ceremony — anything that is not auto-selectable
  // anonymous boot). The `length > 1` short-circuit silently dropped users
  // through to applyReadyState(null) when the only configured option was a
  // single OIDC IdP in anonymous-allowed mode (code review M-3).
  if (options.length === 0) return [];
  if (options.length === 1 && options[0].kind === 'anonymous') return [];
  return [...options];
}

export function formAssuranceFloorForDefinition(
  definition: FormDefinition,
): AssuranceLevel | undefined {
  const assurance = optionalObject(
    optionalObject(definition, 'metadata'),
    'assurance',
  );
  if (!assurance) return undefined;

  const ial = optionalAssuranceLevel(assurance, 'ial');
  const aal = optionalAssuranceLevel(assurance, 'aal');
  optionalString(assurance, 'jurisdiction');
  if (!ial) return aal;
  if (!aal) return ial;
  return assuranceRank(ial) >= assuranceRank(aal) ? ial : aal;
}

export function identityClaimMeetsAssurance(
  claim: IdentityClaim | null,
  required: AssuranceLevel | undefined,
): boolean {
  return required === undefined || (
    claim !== null && assuranceRank(claim.assuranceLevel) >= assuranceRank(required)
  );
}

export function subjectRefInvalidatedByIdentityChange(
  previous: IdentityClaim | null,
  next: IdentityClaim | null,
): string | undefined {
  const previousSubjectRef = previous?.subjectRef;
  if (!previousSubjectRef || previousSubjectRef === next?.subjectRef) {
    return undefined;
  }
  return previousSubjectRef;
}

export function identitySubjectChanged(
  previous: IdentityClaim | null,
  next: IdentityClaim | null,
): boolean {
  return previous?.subjectRef !== next?.subjectRef;
}

export function assertIdentityPolicySatisfied({
  claim,
  identityMode,
  runtimeMode,
}: {
  claim: IdentityClaim | null;
  identityMode: IdentityPolicyConfig['mode'];
  runtimeMode: 'demo' | 'production';
}): void {
  if (runtimeMode === 'production' && identityMode === 'oidc-required' && !claim) {
    throw new Error('This deployment requires sign-in before the form can be loaded.');
  }
}

export function isIdentityInteractionStarted(error: unknown): boolean {
  return error instanceof Error && error.name === 'IdentityInteractionStartedError';
}

function optionalObject(
  source: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[key];
  if (value === undefined) return undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${key} must be an object`);
}

function optionalAssuranceLevel(
  source: Record<string, unknown>,
  key: 'ial' | 'aal',
): AssuranceLevel | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (isAssuranceLevel(value)) return value;
  throw new Error(`metadata.assurance.${key} must be one of L1, L2, L3, L4`);
}

function optionalString(
  source: Record<string, unknown>,
  key: 'jurisdiction',
): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  throw new Error(`metadata.assurance.${key} must be a string`);
}

function isAssuranceLevel(value: unknown): value is AssuranceLevel {
  return value === 'L1' || value === 'L2' || value === 'L3' || value === 'L4';
}

function assuranceRank(level: AssuranceLevel): number {
  return Number(level.slice(1));
}

export async function buildIntakeHandoff({
  definition,
  response,
  validationReport,
  draftKey,
  claim,
  idempotencyKey,
  multiParty,
}: {
  definition: FormDefinition;
  response: FormResponse;
  validationReport: ValidationReport | null;
  draftKey: DraftKey;
  claim: IdentityClaim | null;
  idempotencyKey: IdempotencyKey;
  multiParty?: MultiPartyHandoffContext;
}): Promise<IntakeHandoff> {
  const responseId = response.id ?? idempotencyKey;
  const validationId = validationReport ? `validation:${responseId}` : 'validation:none';
  const actorRef = claim?.subjectRef;

  const extensions: NonNullable<IntakeHandoff['extensions']> = {
    'x-formspec-response': response,
    'x-formspec-response-data': response.data,
    'x-formspec-validation-report': validationReport,
  };
  if (multiParty) {
    extensions['x-formspec-active-party-ref'] = multiParty.activePartyRef;
    extensions['x-formspec-multi-party'] = {
      tier: multiParty.policy.tier,
      invitationChannel: multiParty.policy.invitationChannel,
      parties: multiParty.policy.parties,
      partySignatures: multiParty.progress.signatures,
    };
  }

  return {
    $formspecIntakeHandoff: '1.0',
    handoffId: `handoff:${idempotencyKey}`,
    initiationMode: 'publicIntake',
    definitionRef: {
      url: definition.url,
      version: definition.version,
    },
    responseRef: `response:${responseId}`,
    responseHash: await responseHash(response),
    validationReportRef: validationId,
    intakeSessionId: `intake-session:${draftKey.subjectRef ?? 'anonymous'}`,
    actorRef,
    subjectRef: actorRef,
    ledgerHeadRef: `ledger:${responseId}:head`,
    occurredAt: new Date().toISOString(),
    extensions,
  };
}

export interface MultiPartyPartySlot {
  readonly partyRef: string;
  readonly roleId: string;
  readonly label: string;
}

export interface MultiPartySignatureRecord {
  readonly partyRef: string;
  readonly roleId: string;
  readonly subjectRef: string;
  readonly responseRef: string;
  readonly responseHash: string;
  readonly signedAt: string;
}

export interface MultiPartySignerProgress {
  readonly activePartyRef: string;
  readonly signatures: readonly MultiPartySignatureRecord[];
}

export interface MultiPartyHandoffContext {
  readonly policy: ResolvedMultiPartyPolicy;
  readonly progress: MultiPartySignerProgress;
  readonly activePartyRef: string;
}

export function requiredMultiPartySlots(
  policy: ResolvedMultiPartyPolicy,
): readonly MultiPartyPartySlot[] {
  return policy.parties.flatMap((party) => {
    const count = party.cardinality.min;
    return Array.from({ length: count }, (_, index): MultiPartyPartySlot => {
      const partyRef = count === 1 ? party.roleId : `${party.roleId}:${index + 1}`;
      return {
        partyRef,
        roleId: party.roleId,
        label: party.label ?? labelFromPartyRef(partyRef),
      };
    });
  });
}

export function createMultiPartySignerProgress(
  policy: ResolvedMultiPartyPolicy,
): MultiPartySignerProgress {
  const first = requiredMultiPartySlots(policy)[0];
  if (!first) {
    throw new Error('multiParty requires at least one required party slot');
  }
  return { activePartyRef: first.partyRef, signatures: [] };
}

export async function recordMultiPartySigner({
  claim,
  idempotencyKey,
  policy,
  progress,
  response,
}: {
  claim: IdentityClaim | null;
  idempotencyKey: IdempotencyKey;
  policy: ResolvedMultiPartyPolicy;
  progress: MultiPartySignerProgress;
  response: FormResponse;
}): Promise<MultiPartySignerProgress> {
  if (!claim) {
    throw new Error('Multi-party forms require each signer to authenticate before signing.');
  }
  if (progress.signatures.some((signature) => signature.partyRef === progress.activePartyRef)) {
    throw new Error(`Party "${progress.activePartyRef}" has already signed.`);
  }
  if (
    progress.signatures.some((signature) => (
      signature.subjectRef === claim.subjectRef &&
      signature.partyRef !== progress.activePartyRef
    ))
  ) {
    throw new Error('Each party must sign with a distinct authenticated identity.');
  }
  const activeSlot = requiredMultiPartySlots(policy).find(
    (slot) => slot.partyRef === progress.activePartyRef,
  );
  if (!activeSlot) {
    throw new Error(`Unknown active party "${progress.activePartyRef}".`);
  }
  const nextSignatures: MultiPartySignatureRecord[] = [
    ...progress.signatures,
    {
      partyRef: activeSlot.partyRef,
      roleId: activeSlot.roleId,
      subjectRef: claim.subjectRef,
      responseRef: `response:${response.id ?? idempotencyKey}`,
      responseHash: await responseHash(response),
      signedAt: new Date().toISOString(),
    },
  ];
  const nextSlot = requiredMultiPartySlots(policy).find(
    (slot) => !nextSignatures.some((signature) => signature.partyRef === slot.partyRef),
  );
  return {
    activePartyRef: nextSlot?.partyRef ?? activeSlot.partyRef,
    signatures: nextSignatures,
  };
}

export function multiPartyComplete(
  policy: ResolvedMultiPartyPolicy,
  progress: MultiPartySignerProgress,
): boolean {
  const signed = new Set(progress.signatures.map((signature) => signature.partyRef));
  return requiredMultiPartySlots(policy).every((slot) => signed.has(slot.partyRef));
}

export function multiPartyDraftKey(base: DraftKey, partyRef: string | undefined): DraftKey {
  return partyRef ? { ...base, partyRef } : base;
}

function labelFromPartyRef(partyRef: string): string {
  return partyRef
    .replace(/[-_:]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function responseHash(response: FormResponse): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(response));
  if (!globalThis.crypto?.subtle) {
    return `sha256:${fallbackHash(encoded)}`;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return `sha256:${hex(new Uint8Array(digest))}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackHash(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildConfirmationTrackingUri(caseUrn: string): string {
  return `/status?case=${encodeURIComponent(caseUrn)}`;
}

/**
 * FW-0044 in-form submit-or-queue decision (pure helper).
 *
 * Routes submission through the offline queue when the device is offline
 * AND the resolved runtime profile enables `offlineSubmit`; otherwise
 * runs the synchronous transport. The synchronous path may still throw
 * (network failure inline) — the caller surfaces that as the existing
 * 'error' state. The queued path returns a `QueuedSubmit` and the caller
 * surfaces the new 'queued' state.
 *
 * `navigatorOnLine` is the caller's snapshot of `navigator.onLine` — kept
 * as a boolean parameter (not read inside the helper) so tests don't need
 * to monkey-patch the global. `RespondentRuntime` reads
 * `typeof navigator !== 'undefined' && navigator.onLine` and passes the
 * boolean here.
 */
export type SubmitOrQueueOutcome =
  | { readonly kind: 'submitted'; readonly confirmation: SubmitConfirmation }
  | { readonly kind: 'queued'; readonly queuedSubmit: QueuedSubmit };

export interface SubmitOrQueueInput {
  readonly navigatorOnLine: boolean;
  readonly runtimeProfile: ResolvedRuntimeProfile;
  readonly submitTransport: SubmitTransport;
  readonly offlineSubmitQueue: OfflineSubmitQueue;
  readonly handoff: IntakeHandoff;
  readonly idempotencyKey: string;
}

export async function submitOrQueue(
  input: SubmitOrQueueInput,
): Promise<SubmitOrQueueOutcome> {
  const offlineEnabled = input.runtimeProfile.enabled.has('offlineSubmit');
  if (!input.navigatorOnLine && offlineEnabled) {
    const queuedSubmit = await input.offlineSubmitQueue.enqueue(
      input.handoff,
      input.idempotencyKey,
    );
    return { kind: 'queued', queuedSubmit };
  }
  const confirmation = await input.submitTransport.submit(
    input.handoff,
    input.idempotencyKey,
  );
  return { kind: 'submitted', confirmation };
}

/**
 * FW-0027 authorize-then-submit-then-capture-or-void orchestration.
 *
 * Honors the row's "pay and submit succeed or fail as one transaction"
 * promise: the user's account sees ONLY a successful charge OR no charge —
 * never an orphan charge with a failed submission, never a successful
 * submission with no charge.
 *
 * Lifecycle:
 *   1. authorize(amount, methodToken, ${key}:authorize) — HOLD funds.
 *   2. submitTransport.submit(handoff, key) — form intake as today.
 *   3a. on submit success: capture(authorization, ${key}:capture) — CHARGE.
 *   3b. on submit failure: voidAuthorization(authorization, ${key}:void) —
 *       RELEASE the hold; surface 'submit-failed-payment-voided' so the
 *       respondent UI carries the load-bearing "your form did not submit,
 *       and the payment was not charged" copy.
 *
 * Idempotency-key discipline: the three rail calls are derived
 * deterministically from the orchestration `idempotencyKey` —
 * `deriveUuidV7FromString(key, 'authorize' | 'capture' | 'void')` produces
 * UUIDv7-shaped values that satisfy the port-side validator AND collapse to
 * the SAME triple on any runtime retry. The rail's same-key contract then
 * suppresses duplicate holds / captures / voids — no second authorization,
 * no double-charge, no orphan release. Optional caller-supplied overrides
 * (`authorizeKey` / `captureKey` / `voidKey`) exist for adopters who want
 * to derive the family from a caller-side identity (e.g., server-side
 * reconciliation); overrides MUST be valid UUIDv7 values (the rail's
 * `assertUuidV7IdempotencyKey` rejects anything else).
 *
 * Caller contract: only invoke when the resolved profile enables `payment`
 * (the call site has already branched on `paymentEnabled`). The helper
 * asserts the precondition; free-form submits go through `submitOrQueue`,
 * not through here.
 *
 * Outcomes:
 *   - 'submitted-with-payment'      — happy path; authorize → submit → capture.
 *   - 'submit-failed-payment-voided' — submit threw after authorize; void
 *      released the hold; respondent sees user-protection copy.
 *   - 'authorize-failed'            — payment path could not even start; the
 *      submit never ran; surface the rail's plain-language error.
 *   - 'capture-failed'              — submit landed but capture threw; the
 *      form IS in the system; the user is told to contact the sender. The
 *      hold may linger until the rail's expiration. This is the rare
 *      failure mode the design names explicitly — see design §Risks.
 *   - 'void-failed-after-submit-failure' — both submit AND void threw; the
 *      hold remains until rail expiration. Surface a user-protection copy
 *      that names the pending charge will release itself.
 */
export type SubmitWithPaymentOutcome =
  | {
      readonly kind: 'submitted-with-payment';
      readonly confirmation: SubmitConfirmation;
      readonly captureReceipt: CaptureReceipt;
    }
  | { readonly kind: 'authorize-failed'; readonly error: unknown }
  | {
      readonly kind: 'submit-failed-payment-voided';
      readonly authorization: Authorization;
      readonly error: unknown;
    }
  | {
      readonly kind: 'void-failed-after-submit-failure';
      readonly authorization: Authorization;
      readonly submitError: unknown;
      readonly voidError: unknown;
    }
  | {
      readonly kind: 'capture-failed';
      readonly confirmation: SubmitConfirmation;
      readonly authorization: Authorization;
      readonly error: unknown;
    };

export interface SubmitWithPaymentInput {
  readonly runtimeProfile: ResolvedRuntimeProfile;
  readonly definition: FormDefinition;
  readonly submitTransport: SubmitTransport;
  readonly paymentRailAdapter: PaymentRailAdapter;
  readonly handoff: IntakeHandoff;
  readonly idempotencyKey: string;
  /**
   * Method token sourced from the form extension or — in production — from
   * a rail-specific picker UX. Slice 1 reads `definition.extensions
   * ['x-formspec-payment-method-token']` if present. The helper falls back
   * to a literal `'demo-method-stub'` ONLY when the resolved profile is in
   * demo mode (synthetic-definition tests + demo composition); in
   * production the helper throws when neither the override nor the form
   * extension supplies a token (N-2: a `'demo-method-stub'` default in
   * production would silently flow into adopter rail SDKs).
   */
  readonly methodToken?: string;
  /**
   * Optional caller-supplied rail-call keys. Adopters who want to derive
   * the key family from a caller-side identity (e.g., for server-side
   * reconciliation) override these; the value MUST be a valid UUIDv7. The
   * runtime defaults to deterministic derivation from `idempotencyKey` so
   * a retry of the orchestration collapses to the SAME authorize/capture/
   * void triple — see `submitWithPayment` lifecycle doc.
   */
  readonly authorizeKey?: string;
  readonly captureKey?: string;
  readonly voidKey?: string;
}

export const PAYMENT_FALLBACK_METHOD_TOKEN = 'demo-method-stub';

export async function submitWithPayment(
  input: SubmitWithPaymentInput,
): Promise<SubmitWithPaymentOutcome> {
  // Caller-contract assertion: the React shell branches on
  // `paymentEnabled` before invoking. A non-payment composition reaches
  // here only via test misuse; fail loudly instead of silently bypassing
  // the rail.
  if (!input.runtimeProfile.enabled.has('payment')) {
    throw new Error(
      'submitWithPayment invoked with payment disabled in the resolved profile; route free-form submits through submitOrQueue.',
    );
  }

  const amount = extractPaymentAmount(input.definition);
  if (!amount) {
    // Payment is enabled but the form did not declare an amount. The
    // resolver gates on the requirement extractor (boolean), not the
    // amount, so a payment-required form with no amount lands here. Treat
    // as a configuration error — refuse to authorize $0 silently.
    throw new Error(
      'Payment is enabled for this form but extensions["x-formspec-payment-amount"] is missing or malformed.',
    );
  }

  const methodToken = readMethodToken(input);
  const authorizeKey = await resolveRailKey(input.authorizeKey, input.idempotencyKey, 'authorize');
  const captureKey = await resolveRailKey(input.captureKey, input.idempotencyKey, 'capture');
  const voidKey = await resolveRailKey(input.voidKey, input.idempotencyKey, 'void');

  let authorization: Authorization;
  try {
    authorization = await input.paymentRailAdapter.authorize(amount, methodToken, authorizeKey);
  } catch (error) {
    return { kind: 'authorize-failed', error };
  }

  let confirmation: SubmitConfirmation;
  try {
    confirmation = await input.submitTransport.submit(input.handoff, input.idempotencyKey);
  } catch (submitError) {
    try {
      await input.paymentRailAdapter.voidAuthorization(authorization, voidKey);
    } catch (voidError) {
      return {
        kind: 'void-failed-after-submit-failure',
        authorization,
        submitError,
        voidError,
      };
    }
    return { kind: 'submit-failed-payment-voided', authorization, error: submitError };
  }

  try {
    const captureReceipt = await input.paymentRailAdapter.capture(authorization, captureKey);
    return { kind: 'submitted-with-payment', confirmation, captureReceipt };
  } catch (error) {
    return { kind: 'capture-failed', confirmation, authorization, error };
  }
}

async function resolveRailKey(
  override: string | undefined,
  base: string,
  suffix: 'authorize' | 'capture' | 'void',
): Promise<string> {
  if (override !== undefined) {
    assertUuidV7IdempotencyKey(override);
    return override;
  }
  return deriveUuidV7FromString(base, suffix);
}

function readMethodToken(input: SubmitWithPaymentInput): string {
  if (input.methodToken && input.methodToken.length > 0) return input.methodToken;
  const fromDefinition = input.definition.extensions?.['x-formspec-payment-method-token'];
  if (typeof fromDefinition === 'string' && fromDefinition.length > 0) {
    return fromDefinition;
  }
  if (input.runtimeProfile.mode === 'demo') {
    return PAYMENT_FALLBACK_METHOD_TOKEN;
  }
  throw new Error(
    'No payment method token available: caller did not supply `methodToken`, and the form did not declare extensions["x-formspec-payment-method-token"]. Production compositions must wire a rail-specific picker UX that provides the token.',
  );
}


/**
 * FW-0040 iframe-context gate.
 *
 * When the form runtime is mounted inside a host iframe AND the resolved
 * runtime profile enables `embed`, this helper verifies the host origin
 * against `orgRuntimePolicy.limits.embed.allowedOrigins`. Throws
 * `EmbedOriginNotAllowedError` when the host origin is missing, unknown,
 * or not in the allow-list; no-ops when the form is loaded directly
 * (top-level window) OR when `embed` is disabled OR when the wildcard `*`
 * is in the allow-list.
 *
 * Synchronous so the form-load boundary can call it inline after
 * `resolveRuntimeFeatures(...)` without changing the existing await flow.
 * Production transport adapters that resolve `hostOrigin()` via a
 * postMessage handshake return `null` from `hostOrigin()` until handshake
 * completes; the runtime gate fails closed on `null` (no origin matches
 * the allow-list). Adopters needing pre-resolved origin SHOULD complete
 * the handshake in their adapter factory (async function returning a
 * resolved transport) before passing the result into the composition
 * factory — the composition factory itself stays sync (no port-level
 * init hook; the optional `EmbedTransport.ready?` is filed as FW-0102).
 */
export interface VerifyEmbedOriginAllowedInput {
  readonly runtimeProfile: ResolvedRuntimeProfile;
  readonly orgRuntimePolicy: OrgRuntimePolicy;
  readonly embedTransport: EmbedTransport;
}

export function verifyEmbedOriginAllowed(
  input: VerifyEmbedOriginAllowedInput,
): void {
  if (!input.runtimeProfile.enabled.has("embed")) {
    return;
  }
  if (!input.embedTransport.isEmbedded()) {
    return;
  }
  const hostOrigin = input.embedTransport.hostOrigin();
  if (hostOrigin === null) {
    throw new EmbedOriginNotAllowedError(
      "embed transport reports the form is in an iframe but the host origin could not be determined",
    );
  }
  const limits = getEmbedLimits(input.orgRuntimePolicy);
  const allowed = limits?.allowedOrigins ?? [];
  if (!matchesAllowedOrigin(hostOrigin, allowed)) {
    throw new EmbedOriginNotAllowedError(
      `host origin "${hostOrigin}" is not in the allowed-origins list`,
    );
  }
}

/**
 * FW-0040 origin matcher. Accepts the wildcard `*` (allow any) or exact
 * origin matches via URL normalization (case-insensitive scheme + host,
 * port-sensitive per WHATWG URL spec). Returns false when the allow-list
 * is empty.
 */
export function matchesAllowedOrigin(
  hostOrigin: string,
  allowed: readonly string[],
): boolean {
  if (allowed.length === 0) return false;
  let normalizedHost: string;
  try {
    normalizedHost = new URL(hostOrigin).origin;
  } catch {
    return false;
  }
  for (const entry of allowed) {
    if (entry === "*") return true;
    let normalizedEntry: string;
    try {
      normalizedEntry = new URL(entry).origin;
    } catch {
      continue;
    }
    if (normalizedEntry === normalizedHost) return true;
  }
  return false;
}
