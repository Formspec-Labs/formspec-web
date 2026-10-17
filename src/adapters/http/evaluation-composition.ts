import { isRecord } from '../../shared/is-record.ts';
import type { ComposedSourcesReceipt, EvaluationHydrationResult, EvaluationHydrationWire, NativeScreenerMappingReceipt } from '../../ports/evaluation-hydration.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';

function fail(detail: string): never { throw new Error(`Source composition ${detail}`); }
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** Compare Source's UTC instants exactly, including Chrono nanoseconds; hashes keep original strings. */
export function hydrationInstant(value: string): bigint {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? '';
  if (/[1-9]/.test(fraction.slice(9))) fail('unsupported clock precision');
  const whole = Date.parse(value.replace(/\.\d+/, ''));
  if (!Number.isFinite(whole)) fail('clock mismatch');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.slice(0, 9).padEnd(9, '0'));
}
const seconds = (value: number): bigint => BigInt(value) * 1_000_000_000n;
const minimum = (...values: bigint[]): bigint => values.reduce((left, right) => left < right ? left : right);
export async function rawUtf8Hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

interface CompositionPolicy {
  providerId: string;
  providerVersion: string;
  selection: EvaluationHydrationWire['selection'];
  formVersionHash: string;
  outputSchema: { hash: string; document: string };
  budgets: { maxEvidenceAgeSeconds: number; maxValiditySeconds: number; responseBytes: number };
  owners: readonly { instanceName: string; sourceRef: string; resolverKind: 'nativeScreenerMapping' | 'unavailable';
    registrationHash: string | null; unavailableReason: string | null }[];
}

const isNullableString = (value: unknown) => value === null || typeof value === 'string';
/** Shape the verifier reads; the exact pinned Source schema remains the structural authority. */
function isCompositionPolicy(value: unknown): value is CompositionPolicy {
  if (!isRecord(value)) return false;
  const { outputSchema, budgets, owners } = value;
  return typeof value.providerId === 'string' && typeof value.providerVersion === 'string' && isRecord(value.selection)
    && typeof value.formVersionHash === 'string'
    && isRecord(outputSchema) && typeof outputSchema.hash === 'string' && typeof outputSchema.document === 'string'
    && isRecord(budgets) && typeof budgets.maxEvidenceAgeSeconds === 'number' && typeof budgets.maxValiditySeconds === 'number'
    && typeof budgets.responseBytes === 'number'
    && Array.isArray(owners) && owners.every(owner => isRecord(owner) && typeof owner.instanceName === 'string'
      && typeof owner.sourceRef === 'string' && (owner.resolverKind === 'nativeScreenerMapping' || owner.resolverKind === 'unavailable')
      && isNullableString(owner.registrationHash) && isNullableString(owner.unavailableReason));
}

/** Requires the closed Source Hydration decoder and original candidate binding checks first. */
export async function verifyComposedSources(input: {
  view: EvaluationHydrationWire;
  receipt: ComposedSourcesReceipt;
  registrationHash: string | undefined;
  requestHash: string;
  /** Existing independent original mapping/run/association and result verifier; no narrowed request. */
  verifyNative: (receipt: NativeScreenerMappingReceipt, result: EvaluationHydrationResult) => Promise<void>;
}): Promise<number> {
  const { view, receipt, requestHash, verifyNative } = input;
  const registration = receipt.registration;
  const descriptor = registration.publicDescriptor;
  if (!isCompositionPolicy(descriptor)) throw new Error('Source composition descriptor shape differs');
  const { receiptHash, ...preimage } = receipt;
  if (!input.registrationHash || registration.registrationHash !== input.registrationHash
    || registration.registrationHash !== await hash(descriptor) || receiptHash !== await hash(preimage)
    || receipt.requestHash !== requestHash || descriptor.providerId !== registration.providerId
    || descriptor.providerVersion !== registration.providerVersion || await hash(descriptor.selection) !== await hash(view.selection)
    || descriptor.formVersionHash !== view.formVersionHash || descriptor.outputSchema.hash !== registration.outputSchemaHash
    || await rawUtf8Hash(descriptor.outputSchema.document) !== descriptor.outputSchema.hash
    || descriptor.budgets.maxEvidenceAgeSeconds !== registration.maxEvidenceAgeSeconds
    || descriptor.budgets.maxValiditySeconds !== registration.maxValiditySeconds) fail('policy or receipt mismatch');
  if (bytes(descriptor) > 64 * 1024 || bytes(receipt) > 1024 * 1024
    || bytes(view) > descriptor.budgets.responseBytes) fail('byte budget exceeded');
  const names = Object.keys(view.sources).sort();
  const lists = [descriptor.owners, receipt.contributions, view.results];
  for (const entries of lists) {
    if (entries.length !== names.length || entries.some((entry, index) => entry.instanceName !== names[index]
      || entry.sourceRef !== view.sources[names[index]])) fail('sorted source coverage mismatch');
  }
  const now = hydrationInstant(view.qualifiedAt), resolved = hydrationInstant(receipt.resolvedAt);
  if (resolved > now) fail('completion clock mismatch');
  let deadline: bigint | undefined;
  for (let index = 0; index < names.length; index++) {
    const owner = descriptor.owners[index], contribution = receipt.contributions[index], result = view.results[index];
    if (await hash(result) !== contribution.resultHash) fail('complete result digest mismatch');
    if (owner.resolverKind === 'unavailable') {
      if (result.status !== 'unavailable' || result.reason !== owner.unavailableReason
        || contribution.receipt !== null) fail('unavailable owner mismatch');
      continue;
    }
    const leaf = contribution.receipt;
    if (!leaf) {
      if (result.status === 'qualified' || !result.reason.trim()) fail('unqualified native leaf mismatch');
      continue;
    }
    if (owner.resolverKind !== 'nativeScreenerMapping' || leaf.kind !== 'nativeScreenerMapping'
      || owner.registrationHash !== leaf.registration.registrationHash || result.status !== 'qualified'
      || bytes(leaf.registration.publicDescriptor) > 64 * 1024 || bytes(leaf) > 1024 * 1024
      || hydrationInstant(leaf.resolvedAt) > resolved) fail('native owner mismatch');
    await verifyNative(leaf, result);
    const issued = hydrationInstant(result.issuedAt), expires = hydrationInstant(result.expiresAt);
    const child = leaf.registration;
    if (issued > now || expires <= now || issued >= expires
      || expires - issued > seconds(child.maxValiditySeconds)) fail('invalid child validity');
    deadline = minimum(deadline ?? expires, expires, issued + seconds(child.maxEvidenceAgeSeconds),
      issued + seconds(registration.maxEvidenceAgeSeconds), issued + seconds(registration.maxValiditySeconds));
  }
  if (deadline === undefined) {
    if (receipt.validUntil !== null) fail('unqualified deadline mismatch');
    return Infinity;
  }
  if (receipt.validUntil === null || hydrationInstant(receipt.validUntil) !== deadline || deadline <= now) fail('shared deadline mismatch');
  // Round down to host milliseconds: conversion must never extend the original deadline.
  return Math.floor(Number(deadline - now) / 1_000_000);
}
