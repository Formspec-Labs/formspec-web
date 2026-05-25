import type { DraftKey, DraftStore } from '../ports/draft-store.ts';
import type { NotificationDelivery } from '../ports/notification-delivery.ts';
import type { SubmitConfirmation } from '../ports/submit-transport.ts';
import type { ResolvedMultiPartyPolicy } from '../policy/index.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import {
  multiPartyDraftKey,
  multiPartyProgressDraftKey,
  requiredMultiPartySlots,
  type MultiPartyPersistedState,
} from './respondent-flow.ts';

export const PUBLIC_TERMINAL_SMS_SENT_COPY = 'Receipt sent by SMS.';
export const PUBLIC_TERMINAL_SMS_INVALID_COPY = 'Enter a phone number that can receive SMS.';
export const PUBLIC_TERMINAL_CLEARED_TITLE = 'This computer is clear';
export const PUBLIC_TERMINAL_CLEARED_BODY =
  'Your local draft and sign-in session were cleared from this browser.';

export interface SendPublicTerminalReceiptSmsInput {
  readonly notificationDelivery: NotificationDelivery;
  readonly confirmation: SubmitConfirmation;
  readonly phone: string;
  readonly idempotencyKey?: string;
}

export interface ClearPublicTerminalDraftStateInput {
  readonly draftStore: DraftStore;
  readonly draftKey: DraftKey;
  readonly multiPartyPolicy?: ResolvedMultiPartyPolicy;
  readonly multiPartyState?: MultiPartyPersistedState | null;
  readonly subjectRef?: string;
}

export async function sendPublicTerminalReceiptSms({
  notificationDelivery,
  confirmation,
  phone,
  idempotencyKey = generateIdempotencyKey(),
}: SendPublicTerminalReceiptSmsInput): Promise<void> {
  const to = normalizeSmsDestination(phone);
  await notificationDelivery.send(
    {
      channel: 'sms',
      to,
      body: publicTerminalReceiptSmsBody(confirmation),
    },
    idempotencyKey,
  );
}

export function canSendPublicTerminalReceiptSms(
  notificationDelivery: NotificationDelivery | undefined,
): notificationDelivery is NotificationDelivery {
  return notificationDelivery?.capabilities?.sms === 'real';
}

export function publicTerminalReceiptSmsBody(confirmation: SubmitConfirmation): string {
  const base = `Form submitted. Reference ${confirmation.referenceNumber}. Verifier code ${publicTerminalVerifierCode(confirmation)}.`;
  const trackingUrl = publicTerminalTrackingUrl(confirmation);
  return trackingUrl ? `${base} Track: ${trackingUrl}` : base;
}

export function publicTerminalVerifierCode(confirmation: SubmitConfirmation): string {
  const normalized = confirmation.referenceNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!normalized) return 'RECEIVED';
  return normalized.length > 6 ? normalized.slice(-6) : normalized;
}

export function publicTerminalTrackingUrl(
  confirmation: SubmitConfirmation,
): string | undefined {
  const href = confirmation.trackingUri;
  if (!href) return undefined;
  try {
    return new URL(href, globalThis.location?.origin ?? 'https://formspec.local').toString();
  } catch {
    return href;
  }
}

export function normalizeSmsDestination(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) {
    throw new Error(PUBLIC_TERMINAL_SMS_INVALID_COPY);
  }
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function publicTerminalDraftKeysToClear({
  draftKey,
  multiPartyPolicy,
}: Omit<ClearPublicTerminalDraftStateInput, 'draftStore' | 'subjectRef'>): DraftKey[] {
  const keys = [draftKey];
  if (multiPartyPolicy) {
    keys.push(multiPartyProgressDraftKey(draftKey));
    for (const slot of requiredMultiPartySlots(multiPartyPolicy)) {
      keys.push(multiPartyDraftKey(draftKey, slot.partyRef));
    }
  }
  return dedupeDraftKeys(keys);
}

export async function clearPublicTerminalDraftState({
  draftStore,
  draftKey,
  multiPartyPolicy,
  multiPartyState,
  subjectRef,
}: ClearPublicTerminalDraftStateInput): Promise<void> {
  const keys = publicTerminalDraftKeysToClear({
    draftKey,
    multiPartyPolicy,
    multiPartyState,
  });
  await Promise.all(keys.map((key) => draftStore.delete(key)));
  if (subjectRef) {
    await draftStore.invalidateSubject(subjectRef);
  }
}

function dedupeDraftKeys(keys: readonly DraftKey[]): DraftKey[] {
  const seen = new Set<string>();
  const result: DraftKey[] = [];
  for (const key of keys) {
    const fingerprint = [
      key.subjectRef ?? '',
      key.partyRef ?? '',
      key.formUrl,
      key.formVersion ?? '',
    ].join('\u0000');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(key);
  }
  return result;
}
