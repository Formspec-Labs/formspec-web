import Ajv2020 from 'ajv/dist/2020.js';
import { decodeBase64 } from '../../shared/base64.ts';
import addFormats from 'ajv-formats';
import canonicalize from 'canonicalize';
import proofSchema from './source-schemas/evaluation-instance-proof-read-v1.schema.json';
import compositionSchema from './source-schemas/evaluation-composition-v2.schema.json';
import runSchema from './source-schemas/web-structured-image-completed-run.schema.json';
import type { ImmutableObjectBytes, InitialInstanceProof, InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import type { EvaluationProviderRegistration } from '../../ports/evaluation-hydration.ts';
import { computeJcsSha256Digest as hash } from './response-action-ledger.ts';
import { requireWireJson, freezeWireJson } from './wire-json.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { decodeInitialInstanceProof } from './initial-mixed-proof-wire.ts';

type Role = 'rawOutput' | 'preparedInputs' | 'executionMetadata';
interface CompletedRun {
  readonly version: 1;
  readonly request: InitialNativeRequest;
  readonly registration: EvaluationProviderRegistration;
  readonly attachmentReference: unknown;
  readonly inputDigest: string;
  readonly inputByteLength: number;
  readonly outcome: {
    readonly outcome: 'completed'; readonly version: 1; readonly invocationId: string;
    readonly requestBindingHash: string; readonly executorConfigHash: string; readonly inputDigest: string;
    readonly observations: { readonly document: unknown; readonly canonicalOutputDigest: string };
    readonly measuredFacts: { readonly byteLength: number; readonly width: number; readonly height: number;
      readonly frameCount: number; readonly detectedFormat: string; readonly decodeComplete: boolean };
    readonly execution: { readonly startedAt: string; readonly completedAt: string; readonly elapsedMillis: number };
    readonly diagnosticArtifactRefs: readonly { readonly digest: string; readonly byteLength: number; readonly hostOwnedLocator: string }[];
  };
  readonly retainedDiagnostics: readonly { readonly role: Role; readonly hostOwnedLocator: string;
    readonly object: ImmutableObjectBytes['object'] }[];
  readonly issuedAt: string; readonly completedAt: string; readonly expiresAt: string; readonly runHash: string;
}
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(proofSchema); ajv.addSchema(compositionSchema);
const validateRun = ajv.compile<CompletedRun>(runSchema);
const equal = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);
function fail(detail: string): never { throw new Error(`Source initial image objects ${detail}`); }
const caps: Readonly<Record<Role, number>> = { rawOutput: 65_536, preparedInputs: 33_619_968, executionMetadata: 65_536 };
const utf8Length = (value: string) => new TextEncoder().encode(value).byteLength;

function decodedBytes(encoded: string, cap: number): Uint8Array<ArrayBuffer> {
  try { return decodeBase64(encoded, cap); } catch (error) { return fail((error as Error).message); }
}
async function rawHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function checkedBytes(value: ImmutableObjectBytes, cap: number, kind: ImmutableObjectBytes['object']['object_kind'],
  invocation: string | undefined, check: () => void): Promise<Uint8Array<ArrayBuffer>> {
  check();
  const metadata = value.object;
  const bytes = decodedBytes(value.bytesBase64, cap);
  const fields: readonly (readonly [string, number])[] = [[metadata.object_artifact_id, 2048], [metadata.aggregate_type, 128],
    [metadata.aggregate_id, 2048], [metadata.object_kind, 128], [metadata.object_uri, 4096], [metadata.content_type, 256]];
  if (metadata.object_kind !== kind || metadata.aggregate_type !== 'structured_image_run'
    || fields.some(([value, limit]) => utf8Length(value) < 1 || utf8Length(value) > limit)
    || (kind === 'immutable:structured-image-run:v1' && metadata.content_type !== 'application/json')
    || metadata.byte_length !== bytes.byteLength || (invocation !== undefined && metadata.aggregate_id !== invocation)
    || await rawHash(bytes) !== metadata.checksum_sha256) fail('immutable metadata or byte digest mismatch');
  check();
  return bytes;
}
function parsedJson(bytes: Uint8Array<ArrayBuffer>): unknown {
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  requireWireJson(value);
  return value;
}

/** Matches Source's loaded-byte constructor; this does not qualify policy, observations or results. */
export async function verifyInitialImageObjectIntegrity(input: Extract<InitialInstanceProof, { kind: 'image' }>,
  assertCurrent: () => void): Promise<CompletedRun> {
  const check = () => { assertSynchronousGuard(assertCurrent); };
  check();
  const proof = decodeInitialInstanceProof(input);
  if (proof.kind !== 'image') fail('selected image proof required');
  const bytes = await checkedBytes(proof.run, 2 * 1024 * 1024, 'immutable:structured-image-run:v1', undefined, check);
  const run = parsedJson(bytes);
  if (!validateRun(run)) fail('closed retained run shape mismatch');
  const { runHash, ...preimage } = run;
  if (await hash(preimage) !== runHash || proof.run.object.aggregate_id !== run.outcome.invocationId
    || !equal(run.request, proof.request) || proof.diagnostics.length !== 3) fail('retained run digest or request mismatch');
  check();
  const roles = new Set<Role>(), locators = new Set<string>(), uris = new Set<string>([proof.run.object.object_uri]);
  for (const retained of run.retainedDiagnostics) {
    if (roles.has(retained.role) || locators.has(retained.hostOwnedLocator) || !retained.hostOwnedLocator
      || utf8Length(retained.hostOwnedLocator) > 2048 || uris.has(retained.object.object_uri)) fail('duplicate role, locator or object');
    roles.add(retained.role); locators.add(retained.hostOwnedLocator); uris.add(retained.object.object_uri);
    const matches = proof.diagnostics.filter(value => equal(value.object, retained.object));
    if (matches.length !== 1) fail('complete diagnostic metadata mismatch');
    const diagnostic = await checkedBytes(matches[0], caps[retained.role], 'immutable:structured-image-diagnostic:v1',
      run.outcome.invocationId, check);
    const references = run.outcome.diagnosticArtifactRefs.filter(value => value.hostOwnedLocator === retained.hostOwnedLocator);
    if (references.length !== 1 || references[0].digest !== retained.object.checksum_sha256
      || references[0].byteLength !== diagnostic.byteLength) fail('diagnostic reference mismatch');
    if (retained.role === 'rawOutput') {
      const observations = parsedJson(diagnostic);
      if (!equal(observations, run.outcome.observations.document)
        || await hash(observations) !== run.outcome.observations.canonicalOutputDigest) fail('actual raw observations mismatch');
      check();
    }
  }
  // Exactly three distinct roles and metadata matches imply complete diagnostic coverage.
  if (roles.size !== 3) fail('diagnostic role coverage mismatch');
  freezeWireJson(run);
  check();
  return run;
}
