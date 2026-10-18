import { canonicalFiniteJson, captureResponseFieldMetadata, snapshotFiniteJson } from '@formspec-org/surface';
import { decodeBase64 } from './base64.ts';
import { createStaticResponseMetadataReader } from '@formspec-org/engine/static-presentation';
import { canonicalResponseHandoffBytes } from '@formspec-org/integrity-canonical';
import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
import type { AcceptedTaskResponseReviewPresentation, AcceptedTaskResponseReviewSign } from '@formspec-org/surface-react/widget-metadata';
import { validateCanonicalFormResponse } from '../adapters/schema/index.ts';
import { assertSynchronousGuard } from './synchronous-guard.ts';

/** Read-only task display identity. Source and WOS qualify the retained Sign. */
export type AcceptedTaskSignIdentity = AcceptedTaskResponseReviewSign;

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const equal = (a: unknown, b: unknown) => canonicalFiniteJson(snapshotFiniteJson(a)) === canonicalFiniteJson(snapshotFiniteJson(b));
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Retained task presentation object required');
  return value as Record<string, unknown>;
}
async function hash(bytes: Uint8Array<ArrayBuffer>) {
  return 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
/** Reads an own data property without invoking accessors. */
function ownValue(value: unknown, key: string): unknown {
  const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

/** Uses exact retained static wording under a qualified current case lifetime.
 * This does not verify signatures, create an IntakeHandoff, or authorize access.
 * The Response hash reads `input.response` as handed over: parse records with
 * `parseJsonExact` so a decimal a JS number cannot hold keeps every digit.
 */
export async function prepareStaticTaskPresentation(input: {
  readonly definition: FormDefinition;
  readonly response: FormResponse;
  readonly retainedSign: unknown;
  readonly retainedPresentation: unknown;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  qualifyCurrent(options: { signal: AbortSignal }): Promise<void>;
}): Promise<AcceptedTaskResponseReviewPresentation> {
  const signal = input.signal;
  const assertCurrent = input.assertCurrent.bind(input);
  const qualifyCurrent = input.qualifyCurrent.bind(input);
  const check = () => { signal.throwIfAborted(); assertSynchronousGuard(assertCurrent); };
  check();
  const definition = snapshotFiniteJson(input.definition, true) as unknown as FormDefinition;
  // Hash first; the read-only view comes from the same canonical bytes, so a
  // JSON.rawJSON number is hashed exactly and read as its nearest JS number.
  const handoff = canonicalResponseHandoffBytes(input.response);
  const response = snapshotFiniteJson(JSON.parse(new TextDecoder().decode(handoff.subarray(handoff.indexOf(0) + 1))), true) as unknown as FormResponse;
  const sign = object(snapshotFiniteJson(input.retainedSign, true));
  let signedHandoff: Uint8Array | undefined;
  try { signedHandoff = canonicalResponseHandoffBytes(ownValue(input.retainedSign, 'signedCanonicalResponse')); } catch { signedHandoff = undefined; }
  const presentation = object(snapshotFiniteJson(input.retainedPresentation, true));
  if (!response.displayedLocale || !response.displayedLocale.locale?.trim())
    throw new Error('Recorded task Locale required');
  const association = object(sign.association);
  const recordRef = sign.recordRef;
  const recordHash = sign.recordHash;
  if (typeof recordRef !== 'string' || typeof recordHash !== 'string' || !digestPattern.test(recordHash)
    || recordRef !== `urn:formspec:task-draft-sign:${recordHash}`
    || typeof sign.signedResponseHash !== 'string' || !digestPattern.test(sign.signedResponseHash)
    || !signedHandoff || !sameBytes(signedHandoff, handoff)
    || typeof association.formVersionHash !== 'string' || !digestPattern.test(association.formVersionHash)
    || presentation.version !== 1 || presentation.formVersionHash !== association.formVersionHash
    || !equal(presentation.selectedLocale ?? null, response.displayedLocale ?? null)
    || !Array.isArray(presentation.artifacts) || presentation.artifacts.length < 1 || presentation.artifacts.length > 64)
    throw new Error('Retained task Sign and presentation differ');
  await qualifyCurrent({ signal }); check();
  if (!response.authoredSignatures?.length || !await validateCanonicalFormResponse(response)) throw new Error('Canonical signed task Response required');
  check();
  const responseHash = await hash(handoff); check();
  if (responseHash !== sign.signedResponseHash) throw new Error('Retained task Response hash differs');
  let selectedDefinition: Record<string, unknown> | undefined;
  let locale: LocaleDocument | null = null;
  let total = 0;
  const identities = new Set<string>();
  for (const value of presentation.artifacts) {
    const artifact = object(value);
    if (typeof artifact.bytes !== 'string') throw new Error('Bounded retained artifact bytes required');
    let retainedBytes: Uint8Array<ArrayBuffer>;
    try { retainedBytes = decodeBase64(artifact.bytes, 1024 * 1024); } catch { throw new Error('Bounded retained artifact bytes required'); }
    total += retainedBytes.length;
    if (total > 4 * 1024 * 1024) throw new Error('Retained presentation byte limit exceeded');
    const identity = canonicalFiniteJson(snapshotFiniteJson([artifact.kind, artifact.reference, artifact.authoredVersion ?? null]));
    if (identities.has(identity)) throw new Error('Duplicate retained task artifact');
    identities.add(identity);
    if (artifact.kind !== 'definition' && artifact.kind !== 'locale') continue;
    if (await hash(retainedBytes) !== artifact.rawHash) throw new Error('Retained display artifact bytes changed');
    check();
    const document = object(snapshotFiniteJson(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(retainedBytes)), true));
    if (document.version !== artifact.authoredVersion || document.url !== artifact.reference)
      throw new Error('Retained display artifact identity differs');
    if (artifact.kind === 'definition') {
      if (selectedDefinition || !equal(document, definition)) throw new Error('Retained task Definition differs');
      selectedDefinition = document;
    } else {
      if (locale || !response.displayedLocale || document.url !== response.displayedLocale.url
        || document.version !== response.displayedLocale.version || document.locale !== response.displayedLocale.locale)
        throw new Error('Retained task Locale differs');
      locale = document as unknown as LocaleDocument;
    }
  }
  if (!selectedDefinition || (!!response.displayedLocale !== !!locale)) throw new Error('Retained display artifacts unavailable');
  const reader = createStaticResponseMetadataReader({ definition, response, locale });
  const fields = captureResponseFieldMetadata(definition, response, reader);
  await qualifyCurrent({ signal }); check();
  return { phase: 'accepted-record' as const, taskSign: { recordRef, recordHash },
    responseHash: responseHash.slice('sha256:'.length), definitionUrl: definition.url,
    definitionVersion: definition.version, locale: response.displayedLocale.locale, fields };
}
