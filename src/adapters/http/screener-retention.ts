import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import canonicalize from 'canonicalize';
import schema from './source-schemas/native-screener-api.schema.json';
import { computeJcsSha256Digest } from './response-action-ledger.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import type {
  AssociateScreenerCandidate, RetainScreenerCompletion, ScreenerAssociation,
  ScreenerOperationContext, ScreenerRetention, ScreenerRunView, ScreenerSelection,
} from '../../ports/screener-retention.ts';

const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv);
// Byte-for-byte reviewed Source native-instance-mapping public schema (b06409f5). Named endpoint definitions avoid the root oneOf ambiguity.
ajv.addSchema(schema, 'urn:formspec-web:source-native-screener-api');
const validators = Object.fromEntries(['Selection', 'Create', 'RunView', 'Associate', 'Association'].map(name => [
  name, ajv.compile({ $ref: `urn:formspec-web:source-native-screener-api#/$defs/${name}` }),
]));
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export interface HttpScreenerRetentionConfig extends HttpClientConfig {
  readonly selection: ScreenerSelection;
  readonly selectionHash: string;
}

function requireSchema(name: string, value: unknown): void {
  if (!validators[name]?.(value)) throw new Error(`Invalid Source Screener ${name}`);
}
function equal(left: unknown, right: unknown): boolean { return canonicalize(left) === canonicalize(right); }
function check(context: ScreenerOperationContext): void { context.signal.throwIfAborted(); context.assertCurrent(); }
function requireIdentity(view: ScreenerRunView, context: ScreenerOperationContext): void {
  const owner = view.run.owner;
  const identity = owner.authenticated;
  if (identity.issuer !== context.identity.issuer || identity.subject !== context.identity.subject
    || identity.clientId !== context.identity.clientId || owner.sessionId !== identity.sessionId
    || owner.subjectRef !== identity.subjectRef) throw new Error('Source Screener owner mismatch');
}
function options(context: ScreenerOperationContext) {
  return { signal: context.signal, assertCurrent: context.assertCurrent, timeoutMs: TIMEOUT_MS,
    maxResponseBytes: MAX_BYTES, requireJson: true, requireNoStore: true, successStatuses: [200] };
}

/** Fixed public endpoints through the existing authenticated tenant-aware HTTP client. */
export class HttpScreenerRetention implements ScreenerRetention {
  private readonly client: HttpClient;
  private readonly selection: ScreenerSelection;
  private readonly selectionHash: string;
  private readonly issued = new WeakSet<ScreenerRunView>();

  constructor(config: HttpScreenerRetentionConfig) {
    requireSchema('Selection', config.selection);
    const headers = config.tenantBinding && tenantScopeHeaders(config.tenantBinding);
    const scope = config.selection.evaluationSelection.scope;
    if (['.', '..'].includes(config.selection.evaluationSelection.formId)
      || !headers || headers['x-formspec-tenant-id'] !== scope.tenant_id
      || headers['x-formspec-workspace-id'] !== scope.workspace_id
      || headers['x-formspec-environment-id'] !== scope.environment_id
      || headers['x-formspec-cell-id'] !== scope.cell_id
      || !config.selection.evaluationSelection.requiredSources.includes(config.selection.sourceRef)
      || !/^sha256:[0-9a-f]{64}$/.test(config.selectionHash)) throw new Error('Source Screener selection binding mismatch');
    this.client = new HttpClient(config);
    this.selection = structuredClone(config.selection);
    this.selectionHash = config.selectionHash;
  }

  async retain(input: RetainScreenerCompletion): Promise<ScreenerRunView> {
    check(input);
    // Detach before hashing, credentials or transport. Retries keep the host's original completionId.
    const request = structuredClone({ completionId: input.completionId, document: input.document,
      screenerRef: input.screenerRef, answers: input.answers, target: input.target, identity: input.identity });
    if (!validCompletionKey(request.completionId)
      || !this.selection.allowedTargets.includes(request.target)
      || request.screenerRef.url !== this.selection.screenerUrl
      || request.screenerRef.version !== this.selection.screenerVersion
      || request.document.url !== request.screenerRef.url || request.document.version !== request.screenerRef.version
      || await computeJcsSha256Digest(this.selection) !== this.selectionHash
      || await computeJcsSha256Digest(request.document) !== this.selection.screenerHash) throw new Error('Source Screener completion pins mismatch');
    check(input);
    const answers = Object.fromEntries(Object.entries(request.answers).map(([path, value]) => [path, { state: 'answered', value }]));
    const body = { selectionHash: this.selectionHash, answers };
    requireSchema('Create', body);
    if (new TextEncoder().encode(JSON.stringify(answers)).byteLength > 65536) throw new Error('Source Screener answers exceed the admitted byte limit');
    const value = await this.client.postJson<unknown>(`/forms/${encodeURIComponent(this.selection.evaluationSelection.formId)}/screener-runs`, body,
      { ...options(input), idempotencyKey: request.completionId });
    check(input);
    requireSchema('RunView', value);
    const view = value as ScreenerRunView;
    requireIdentity(view, { ...input, identity: request.identity });
    const run = view.run;
    const { evidenceHash, ...evidence } = run;
    if (!equal(view.selection, this.selection) || !equal(run.scope, this.selection.evaluationSelection.scope)
      || run.selectionHash !== this.selectionHash || !equal(run.answers, answers)
      || run.answersHash !== await computeJcsSha256Digest(answers)
      || run.determinationHash !== await computeJcsSha256Digest(run.determination)
      || evidenceHash !== await computeJcsSha256Digest(evidence)
      || run.evidenceRef !== `urn:formspec:source:screener:${run.runId}:revision:${run.revision}`
      || run.determination.timestamp !== run.evaluatedAt
      || !equal(run.determination.screener, request.screenerRef)
      || view.acceptance === null) throw new Error('Source Screener retained evidence mismatch');
    const current = view.acceptance;
    if (Date.parse(current.checkedAt) < Date.parse(run.evaluatedAt)) throw new Error('Source Screener acceptance predates evaluation');
    if (current.qualification.status === 'ready') {
      const validity = run.determination.validity as { validUntil?: string } | undefined;
      if (run.qualification.status !== 'ready' || run.qualification.target !== request.target
        || current.qualification.target !== request.target || run.determination.status !== 'completed'
        || (validity?.validUntil !== undefined && Date.parse(current.checkedAt) >= Date.parse(validity.validUntil))) {
        throw new Error('Source Screener current acceptance mismatch');
      }
    }
    check(input);
    // Freeze every nested field so later caller mutation cannot cross the association boundary.
    freeze(view);
    this.issued.add(view);
    return view;
  }

  async associate(input: AssociateScreenerCandidate): Promise<ScreenerAssociation> {
    check(input);
    if (!this.issued.has(input.run) || input.run.acceptance?.qualification.status !== 'ready') throw new Error('A current retained Screener run is required');
    const run = input.run.run;
    const saved = structuredClone(input.saved);
    const identity = structuredClone(input.identity);
    requireIdentity(input.run, { ...input, identity });
    const selected = this.selection.evaluationSelection;
    if (['.', '..'].includes(saved.draft.id) || !Number.isSafeInteger(saved.draft.version) || saved.draft.version < 1
      || saved.draftKey.formUrl !== selected.definitionUrl || saved.draftKey.formVersion !== selected.definitionVersion || saved.evidence.form_version_id !== selected.formVersionId
      || saved.draft.id !== saved.evidence.draft_id || saved.draft.version !== saved.evidence.draft_version
      || saved.evidence.status !== 'in_progress' || !equal(saved.response, saved.evidence.canonical_response)
      || saved.actor.id !== run.owner.subjectRef || saved.evidence.subject_ref !== run.owner.subjectRef) {
      throw new Error('Saved candidate does not match the Source Screener owner or publication');
    }
    const candidateHash = await computeJcsSha256Digest(saved.response);
    check(input);
    const body = { selectionHash: this.selectionHash, runId: run.runId, runRevision: run.revision,
      draftVersion: saved.draft.version, candidateHash };
    requireSchema('Associate', body);
    const value = await this.client.postJson<unknown>(`/drafts/${encodeURIComponent(saved.draft.id)}/screener-associations`, body, options(input));
    check(input);
    requireSchema('Association', value);
    const association = value as ScreenerAssociation;
    if (!equal(association.scope, run.scope) || !equal(association.owner, run.owner)
      || association.draftId !== saved.draft.id || association.draftVersion !== saved.draft.version
      || association.candidateHash !== candidateHash || association.selectionHash !== this.selectionHash
      || association.runId !== run.runId || association.runRevision !== run.revision
      || association.evidenceHash !== run.evidenceHash) throw new Error('Source Screener association mismatch');
    freeze(association);
    return association;
  }
}
function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

function validCompletionKey(value: string): boolean {
  // Public Surface acts are UUIDs. Require a lossless visible-ASCII HTTP header representation.
  if (!value || value !== value.trim() || /[^\x20-\x7e]/.test(value) || new TextEncoder().encode(value).byteLength > 256) return false;
  return new Headers({ 'Idempotency-Key': value }).get('Idempotency-Key') === value;
}
