import type {
  FormDefinition,
  FormResponse,
  IntakeHandoff,
  ValidationReport,
} from '@formspec-org/types';
import type { IFormEngine } from '@formspec-org/engine';
import type { IdentityPolicyConfig } from '../config/types.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { IdentityClaim, IdpOption } from '../ports/identity-provider.ts';
import type {
  OfflineSubmitQueue,
  QueuedSubmit,
} from '../ports/offline-submit-queue.ts';
import type {
  SubmitConfirmation,
  SubmitTransport,
} from '../ports/submit-transport.ts';
import type { ResolvedRuntimeProfile } from '../policy/index.ts';
import type { IdempotencyKey } from '../shared/idempotency-key.ts';

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

export function selectBootIdentityOption(options: readonly IdpOption[]): IdpOption | undefined {
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
  if (runtimeMode !== 'production' || identityMode !== 'oidc-required') {
    return [];
  }
  return options.filter((option) => option.kind === 'oidc');
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

export async function buildIntakeHandoff({
  definition,
  response,
  validationReport,
  draftKey,
  claim,
  idempotencyKey,
}: {
  definition: FormDefinition;
  response: FormResponse;
  validationReport: ValidationReport | null;
  draftKey: DraftKey;
  claim: IdentityClaim | null;
  idempotencyKey: IdempotencyKey;
}): Promise<IntakeHandoff> {
  const responseId = response.id ?? idempotencyKey;
  const validationId = validationReport ? `validation:${responseId}` : 'validation:none';
  const actorRef = claim?.subjectRef;

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
    extensions: {
      'x-formspec-response': response,
      'x-formspec-response-data': response.data,
      'x-formspec-validation-report': validationReport,
    },
  };
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
