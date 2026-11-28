/**
 * @filedesc Live HTTP implementations of `@formspec-org/surface` `DraftPort` and
 * `@formspec-org/types` `ResponseSelector` backed directly by `formspec-server` endpoints.
 */
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  canonicalDraftProgress,
  type DraftKey,
  type DraftLoadResult,
  type DraftPort,
  type DraftRecord,
  type DraftRepinInput,
  type DraftRepinResult,
  type DraftSaveInput,
  type DraftSaveResult,
  type DraftStartInput,
  type DraftStartResult,
  type FilingDraftObservation,
  type FilingDraftQuery,
  type FilingObservation,
  type FilingStatusObservation,
  type MatchedFilingObservation,
} from '@formspec-org/surface';
import type {
  ResponseSelectionDelivery,
  ResponseSelectionOutcome,
  ResponseSelectionRequest,
  ResponseSelector,
  Sha256Digest,
} from '@formspec-org/types';
import { IDEMPOTENCY_KEY_HEADER } from '../../shared/idempotency-key.ts';
import { isRecord } from '../../shared/is-record.ts';
import { isProblemJson, type ProblemJson } from '../../shared/problem-json.ts';
import { parseScopeKey, scopeKeyHeaders, type ScopeKey } from '../../shared/scope-key.ts';
import { defaultFetch, type AccessTokenProvider, type FetchLike } from './http-client.ts';

export interface ResolvedFormTarget {
  readonly formId: string;
  readonly formVersionId: string;
}

export type FormTargetResolver = (
  scope: string,
  definitionUrl: string,
  definitionVersion?: string,
) => Promise<ResolvedFormTarget> | ResolvedFormTarget;

export interface HttpDraftPortConfig {
  readonly baseUrl: string;
  /** Optional mapping from Surface scope label to 64-hex `x-stack-scope-key`. */
  readonly scopeKeys?: Readonly<Record<string, ScopeKey>>;
  /** Optional fallback 64-hex scope key when a scope label is not in `scopeKeys`. */
  readonly defaultScopeKey?: ScopeKey;
  /** Resolves `(scope, definitionUrl, definitionVersion?)` to server `(formId, formVersionId)`. */
  readonly resolveForm: FormTargetResolver;
  /** Bearer credential provider; may inspect the target Surface scope label. */
  readonly accessToken?:
    | string
    | ((scope: string) => Promise<string | undefined> | string | undefined);
  readonly fetchImpl?: FetchLike;
  /** Whether `readSummaries` requests live filing/WOS disposition joins (default `true`). */
  readonly includeFilings?: boolean;
}

interface RawHttpResult {
  readonly status: number;
  readonly rawText: string;
  readonly parsed: unknown;
  readonly problem?: ProblemJson;
}

interface ParsedDraftView {
  readonly draftId: string;
  readonly draftVersion: number;
  readonly definitionVersion?: string;
  readonly isInitializationOnly: boolean;
  readonly subject?: NonNullable<DraftKey['subject']>;
  readonly selectionPins: Record<string, ResponseSelectionDelivery>;
  readonly canonicalResponse?: Record<string, unknown> | null;
}

const PIN_UNAVAILABLE_PREFIX = 'PIN_UNAVAILABLE:';

function extractPinUnavailableInstance(problem?: ProblemJson): string | undefined {
  const detail = problem?.detail ?? problem?.title;
  if (typeof detail !== 'string') return undefined;
  const idx = detail.indexOf(PIN_UNAVAILABLE_PREFIX);
  if (idx < 0) return undefined;
  const rest = detail.slice(idx + PIN_UNAVAILABLE_PREFIX.length);
  const colon = rest.indexOf(':');
  const instance = (colon >= 0 ? rest.slice(0, colon) : rest).trim();
  return instance.length > 0 ? instance : undefined;
}

function formatRevision(draftId: string, draftVersion: number): string {
  return `${draftId}:${draftVersion}`;
}

function parseRevision(revision: string): { draftId: string; draftVersion: number } | undefined {
  const separator = revision.lastIndexOf(':');
  if (separator <= 0 || separator >= revision.length - 1) return undefined;
  const draftId = revision.slice(0, separator);
  const versionText = revision.slice(separator + 1);
  if (!/^[1-9][0-9]*$/.test(versionText)) return undefined;
  const draftVersion = Number(versionText);
  if (!Number.isSafeInteger(draftVersion) || draftVersion < 1) return undefined;
  return { draftId, draftVersion };
}

function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isSha256Digest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

function parseSubject(value: unknown): NonNullable<DraftKey['subject']> | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== 'string' || typeof value.type !== 'string' || !isRecord(value.keys)) {
    return undefined;
  }
  const keys: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(value.keys)) {
    if (typeof v === 'string' || typeof v === 'number') {
      keys[k] = v;
    } else {
      return undefined;
    }
  }
  return { id: value.id, type: value.type, keys };
}

function parseSelectionDelivery(value: unknown): ResponseSelectionDelivery | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !Array.isArray(value.records) ||
    !isSha256Digest(value.valueDigest) ||
    typeof value.none !== 'boolean' ||
    typeof value.pinned !== 'boolean'
  ) {
    return undefined;
  }
  const records: ResponseSelectionDelivery['records'][number][] = [];
  for (const item of value.records) {
    if (!isRecord(item) || typeof item.responseId !== 'string' || typeof item.definitionVersion !== 'string') {
      return undefined;
    }
    const responseHash = item.responseHash;
    if (responseHash !== undefined && !isSha256Digest(responseHash)) return undefined;
    records.push({
      responseId: item.responseId,
      definitionVersion: item.definitionVersion,
      ...(responseHash !== undefined ? { responseHash } : {}),
    });
  }
  let mapping: ResponseSelectionDelivery['mapping'] | undefined;
  if (value.mapping !== undefined) {
    if (!isRecord(value.mapping) || typeof value.mapping.url !== 'string' || !isSha256Digest(value.mapping.digest)) {
      return undefined;
    }
    mapping = { url: value.mapping.url, digest: value.mapping.digest };
  }
  return {
    value: value.value,
    records,
    valueDigest: value.valueDigest,
    none: value.none,
    pinned: value.pinned,
    ...(mapping !== undefined ? { mapping } : {}),
  };
}

function parseSelectionOutcome(value: unknown): ResponseSelectionOutcome {
  if (!isRecord(value) || value.status !== 'available') {
    return { status: 'unavailable' };
  }
  const delivery = parseSelectionDelivery(value);
  if (!delivery) return { status: 'unavailable' };
  let newer: Extract<ResponseSelectionOutcome, { status: 'available' }>['newer'] | undefined;
  if (value.newer !== undefined) {
    if (
      !isRecord(value.newer) ||
      typeof value.newer.responseId !== 'string' ||
      !isSha256Digest(value.newer.responseHash)
    ) {
      return { status: 'unavailable' };
    }
    newer = {
      responseId: value.newer.responseId,
      responseHash: value.newer.responseHash,
    };
  }
  return {
    status: 'available',
    ...delivery,
    ...(newer !== undefined ? { newer } : {}),
  };
}

function parseDraftView(value: unknown): ParsedDraftView | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.draft_id !== 'string' ||
    typeof value.draft_version !== 'number' ||
    !Number.isSafeInteger(value.draft_version) ||
    value.draft_version < 1
  ) {
    return undefined;
  }
  const selectionPins: Record<string, ResponseSelectionDelivery> = {};
  if (isRecord(value.selection_pins)) {
    for (const [name, rawPin] of Object.entries(value.selection_pins)) {
      const parsed = parseSelectionDelivery(rawPin);
      if (parsed) selectionPins[name] = parsed;
    }
  }
  const canonicalResponse =
    value.canonical_response === null
      ? null
      : isRecord(value.canonical_response)
        ? value.canonical_response
        : undefined;
  return {
    draftId: value.draft_id,
    draftVersion: value.draft_version,
    ...(typeof value.definition_version === 'string'
      ? { definitionVersion: value.definition_version }
      : {}),
    isInitializationOnly: value.is_initialization_only === true,
    ...(parseSubject(value.subject) ? { subject: parseSubject(value.subject) } : {}),
    selectionPins,
    ...(canonicalResponse !== undefined ? { canonicalResponse } : {}),
  };
}

function parseDraftObservation(value: unknown): FilingDraftObservation {
  if (!isRecord(value)) return { status: 'unavailable' };
  if (
    value.status === 'absent' ||
    value.status === 'stale' ||
    value.status === 'unavailable' ||
    value.status === 'denied'
  ) {
    return { status: value.status };
  }
  const current = canonicalDraftProgress(value);
  return current ?? { status: 'unavailable' };
}

function parseFilingObservation(value: unknown): FilingObservation {
  if (!isRecord(value)) return { status: 'unavailable' };
  if (value.status === 'none' || value.status === 'unavailable' || value.status === 'denied') {
    return { status: value.status };
  }
  if (
    (value.status === 'filed' ||
      value.status === 'returned' ||
      value.status === 'accepted' ||
      value.status === 'closed-without-acceptance' ||
      value.status === 'reopened') &&
    typeof value.receiptRef === 'string' &&
    isSha256Digest(value.responseHash) &&
    (value.review === 'available' || value.review === 'unavailable') &&
    Array.isArray(value.comments) &&
    value.comments.every((c): c is string => typeof c === 'string')
  ) {
    const out: MatchedFilingObservation = {
      status: value.status,
      receiptRef: value.receiptRef,
      responseHash: value.responseHash,
      review: value.review,
      comments: [...value.comments],
    };
    return out;
  }
  return { status: 'unavailable' };
}

/**
 * Extracts the exact verbatim JSON substring for one top-level property of a JSON object
 * without parsing numbers through IEEE-754 `Number` (preserving 18-digit exact decimals).
 */
export function extractJsonObjectMember(jsonText: string, memberName: string): string | undefined {
  const len = jsonText.length;
  let pos = skipWhitespace(jsonText, 0);
  if (pos >= len || jsonText[pos] !== '{') return undefined;
  pos = skipWhitespace(jsonText, pos + 1);
  if (pos < len && jsonText[pos] === '}') return undefined;

  while (pos < len) {
    if (jsonText[pos] !== '"') return undefined;
    const keyEnd = scanJsonString(jsonText, pos);
    if (keyEnd < 0) return undefined;
    const parsedKey: unknown = JSON.parse(jsonText.slice(pos, keyEnd));
    if (typeof parsedKey !== 'string') return undefined;
    pos = skipWhitespace(jsonText, keyEnd);
    if (pos >= len || jsonText[pos] !== ':') return undefined;
    const valStart = skipWhitespace(jsonText, pos + 1);
    const valEnd = scanJsonValue(jsonText, valStart);
    if (valEnd < 0) return undefined;
    if (parsedKey === memberName) {
      return jsonText.slice(valStart, valEnd);
    }
    pos = skipWhitespace(jsonText, valEnd);
    if (pos >= len) return undefined;
    if (jsonText[pos] === '}') return undefined;
    if (jsonText[pos] !== ',') return undefined;
    pos = skipWhitespace(jsonText, pos + 1);
  }
  return undefined;
}

function skipWhitespace(text: string, pos: number): number {
  let i = pos;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
      i += 1;
    } else {
      break;
    }
  }
  return i;
}

function scanJsonString(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i += 1;
  }
  return -1;
}

function scanJsonValue(text: string, start: number): number {
  if (start >= text.length) return -1;
  const ch = text[start];
  if (ch === '"') return scanJsonString(text, start);
  if (ch === '{' || ch === '[') {
    const open = ch;
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let i = start;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        i = scanJsonString(text, i);
        if (i < 0) return -1;
        continue;
      }
      if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return -1;
  }
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === ',' || c === '}' || c === ']' || c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      break;
    }
    i += 1;
  }
  return i > start ? i : -1;
}

function subjectInputWire(
  subject: DraftKey['subject'],
): { type: string; keys: Record<string, string | number> } | undefined {
  if (!subject) return undefined;
  return {
    type: subject.type,
    keys: { ...subject.keys },
  };
}

function extractDraftRecord(view: ParsedDraftView, rawText: string): DraftRecord | undefined {
  const responseSlice = extractJsonObjectMember(rawText, 'canonical_response');
  if (!responseSlice || responseSlice === 'null') return undefined;
  const snapshotSlice = extractJsonObjectMember(rawText, 'draft_snapshot');
  let snapshotJson: string;
  if (snapshotSlice && snapshotSlice !== 'null') {
    snapshotJson = snapshotSlice;
  } else {
    const defUrl =
      typeof view.canonicalResponse?.definitionUrl === 'string'
        ? view.canonicalResponse.definitionUrl
        : '';
    const defVer =
      view.definitionVersion ??
      (typeof view.canonicalResponse?.definitionVersion === 'string'
        ? view.canonicalResponse.definitionVersion
        : '');
    const dataSlice = extractJsonObjectMember(responseSlice, 'data') ?? '{}';
    snapshotJson = `{"definitionUrl":${JSON.stringify(defUrl)},"definitionVersion":${JSON.stringify(defVer)},"data":${dataSlice}}`;
  }
  return {
    revision: formatRevision(view.draftId, view.draftVersion),
    snapshotJson,
    responseJson: responseSlice,
    pins: { ...view.selectionPins },
  };
}

/**
 * Live `DraftPort` adapter speaking directly to `formspec-server` HTTP routes without mocks.
 */
export class HttpDraftPort implements DraftPort {
  private readonly baseUrl: string;
  private readonly scopeKeys: Readonly<Record<string, ScopeKey>>;
  private readonly defaultScopeKey?: ScopeKey;
  private readonly resolveForm: FormTargetResolver;
  private readonly accessToken?: HttpDraftPortConfig['accessToken'];
  private readonly fetchImpl: FetchLike;
  private readonly includeFilings: boolean;

  constructor(config: HttpDraftPortConfig) {
    if (!config.baseUrl.trim()) {
      throw new Error('HttpDraftPort baseUrl is required');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.scopeKeys = config.scopeKeys ?? {};
    this.defaultScopeKey = config.defaultScopeKey;
    this.resolveForm = config.resolveForm;
    this.accessToken = config.accessToken;
    this.fetchImpl = config.fetchImpl ?? defaultFetch();
    this.includeFilings = config.includeFilings ?? true;
  }

  private scopeKeyFor(scope: string | undefined): ScopeKey | undefined {
    if (scope !== undefined) {
      const mapped = this.scopeKeys[scope];
      if (mapped !== undefined) return parseScopeKey(mapped);
      if (/^[0-9a-f]{64}$/.test(scope)) return parseScopeKey(scope);
    }
    return this.defaultScopeKey === undefined ? undefined : parseScopeKey(this.defaultScopeKey);
  }

  private async tokenFor(scope: string): Promise<string | undefined> {
    if (typeof this.accessToken === 'function') {
      return this.accessToken(scope);
    }
    return this.accessToken;
  }

  private async sendRaw(
    scope: string,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: {
      rawBody?: string;
      idempotencyKey?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<RawHttpResult> {
    const headers = new Headers();
    headers.set('accept', 'application/json');
    if (options.rawBody !== undefined) {
      headers.set('content-type', 'application/json');
    }
    const scopeKey = this.scopeKeyFor(scope);
    for (const [name, value] of Object.entries(scopeKeyHeaders(scopeKey))) {
      headers.set(name, value);
    }
    const token = await this.tokenFor(scope);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    if (options.idempotencyKey) {
      headers.set(IDEMPOTENCY_KEY_HEADER, options.idempotencyKey);
    }
    const url = `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    const response = await this.fetchImpl(url, {
      method,
      redirect: 'error',
      headers,
      signal: options.signal,
      body: options.rawBody,
    });
    const rawText = await response.text();
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    let parsed: unknown = undefined;
    if (rawText.length > 0 && contentType.includes('json')) {
      try {
        parsed = parseJsonExact(rawText);
      } catch {
        parsed = undefined;
      }
    }
    const problem = !response.ok && isProblemJson(parsed) ? parsed : undefined;
    return { status: response.status, rawText, parsed, problem };
  }

  async start(input: DraftStartInput): Promise<DraftStartResult> {
    try {
      const target = await this.resolveForm(
        input.scope,
        input.definitionUrl,
        input.definitionVersion,
      );
      const body = JSON.stringify({
        form_version_id: target.formVersionId,
        subject: { type: input.subject.type, keys: { ...input.subject.keys } },
        resume_existing: false,
      });
      const res = await this.sendRaw(
        input.scope,
        'POST',
        `/runtime/forms/${encodeURIComponent(target.formId)}/drafts`,
        { rawBody: body, idempotencyKey: input.attemptId },
      );
      if (res.status === 200) {
        const view = parseDraftView(res.parsed);
        if (!view?.subject) return { status: 'unavailable' };
        return { status: 'started', subject: view.subject };
      }
      if (res.status === 401 || res.status === 403) return { status: 'denied' };
      if (res.status === 400 || res.status === 422) return { status: 'invalid-subject' };
      if (res.status === 409) {
        const instance = extractPinUnavailableInstance(res.problem);
        if (instance) return { status: 'pin-unavailable', instance };
        return { status: 'conflict' };
      }
      return { status: 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  async load(
    key: DraftKey,
    definitionVersion: string,
    signal?: AbortSignal,
  ): Promise<DraftLoadResult> {
    try {
      const target = await this.resolveForm(key.scope, key.definitionUrl, definitionVersion);
      const body = JSON.stringify({
        form_version_id: target.formVersionId,
        ...(key.subject ? { subject: subjectInputWire(key.subject) } : {}),
        resume_existing: true,
      });
      const res = await this.sendRaw(
        key.scope,
        'POST',
        `/runtime/forms/${encodeURIComponent(target.formId)}/drafts`,
        { rawBody: body, idempotencyKey: newIdempotencyKey('load'), signal },
      );
      if (res.status === 401 || res.status === 403) return { status: 'denied' };
      if (res.status === 404) return { status: 'absent' };
      if (res.status !== 200) return { status: 'unavailable' };

      const view = parseDraftView(res.parsed);
      if (!view) return { status: 'unavailable' };
      const revision = formatRevision(view.draftId, view.draftVersion);
      const storedVersion =
        view.definitionVersion ??
        (typeof view.canonicalResponse?.definitionVersion === 'string'
          ? view.canonicalResponse.definitionVersion
          : undefined);
      if (storedVersion !== undefined && storedVersion !== definitionVersion) {
        return { status: 'version-mismatch', storedVersion, revision };
      }
      if (view.isInitializationOnly || view.canonicalResponse == null) {
        return {
          status: 'initialized',
          revision,
          pins: { ...view.selectionPins },
        };
      }
      const draft = extractDraftRecord(view, res.rawText);
      if (!draft) return { status: 'unavailable' };
      return { status: 'loaded', draft };
    } catch {
      return { status: 'unavailable' };
    }
  }

  async save(input: DraftSaveInput): Promise<DraftSaveResult> {
    try {
      let draftId: string;
      let expectedDraftVersion: number;

      if (input.expectedRevision === null) {
        const target = await this.resolveForm(
          input.key.scope,
          input.key.definitionUrl,
          input.definitionVersion,
        );
        const expectedPins: Record<string, string> = {};
        if (input.creationPins) {
          for (const [instance, delivery] of Object.entries(input.creationPins)) {
            expectedPins[instance] = delivery.valueDigest;
          }
        }
        const initBody = JSON.stringify({
          form_version_id: target.formVersionId,
          ...(input.key.subject ? { subject: subjectInputWire(input.key.subject) } : {}),
          resume_existing: false,
          expected_selection_pins: expectedPins,
        });
        const initRes = await this.sendRaw(
          input.key.scope,
          'POST',
          `/runtime/forms/${encodeURIComponent(target.formId)}/drafts`,
          { rawBody: initBody, idempotencyKey: newIdempotencyKey('create') },
        );
        if (initRes.status === 401 || initRes.status === 403) return { status: 'denied' };
        if (initRes.status === 409) {
          const instance = extractPinUnavailableInstance(initRes.problem);
          if (instance) return { status: 'pin-unavailable', instance };
          return { status: 'conflict' };
        }
        if (initRes.status !== 200) return { status: 'unavailable' };

        const initView = parseDraftView(initRes.parsed);
        if (!initView) return { status: 'unavailable' };
        // Caller observed absence (`expectedRevision: null`), so an already-saved draft is a conflict.
        if (initView.draftVersion !== 1 || !initView.isInitializationOnly) {
          return { status: 'conflict' };
        }
        draftId = initView.draftId;
        expectedDraftVersion = 1;
      } else {
        const parsed = parseRevision(input.expectedRevision);
        if (!parsed) return { status: 'conflict' };
        draftId = parsed.draftId;
        expectedDraftVersion = parsed.draftVersion;
      }

      const dataSlice = extractJsonObjectMember(input.responseJson, 'data');
      if (!dataSlice) return { status: 'unavailable' };

      const parts: string[] = [
        `"draft_state":${dataSlice}`,
        `"canonical_response":${input.responseJson}`,
        `"draft_snapshot":${input.snapshotJson}`,
        `"expected_draft_version":${expectedDraftVersion}`,
      ];
      if (input.summary !== null) {
        const summaryWire = {
          sections: input.summary.sections.map((section) => ({
            id: section.id ?? '',
            fields: [...section.fields],
          })),
          progress: input.summary.progress,
        };
        parts.push(`"progress_summary":${JSON.stringify(summaryWire)}`);
      }
      const patchRes = await this.sendRaw(
        input.key.scope,
        'PATCH',
        `/drafts/${encodeURIComponent(draftId)}`,
        { rawBody: `{${parts.join(',')}}` },
      );
      if (patchRes.status === 200) {
        const view = parseDraftView(patchRes.parsed);
        if (!view) return { status: 'unavailable' };
        return {
          status: 'saved',
          revision: formatRevision(view.draftId, view.draftVersion),
        };
      }
      if (patchRes.status === 409) return { status: 'conflict' };
      if (patchRes.status === 401 || patchRes.status === 403 || patchRes.status === 404) {
        return { status: 'denied' };
      }
      return { status: 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  async repinDraft(
    input: DraftRepinInput,
    signal?: AbortSignal,
  ): Promise<DraftRepinResult> {
    const parsedRev = parseRevision(input.expectedRevision);
    if (!parsedRev) return { status: 'conflict' };
    try {
      const body = JSON.stringify({
        expected_draft_version: parsedRev.draftVersion,
        instances: input.instances.map((entry) => ({
          instance: entry.instance,
          prior_value_digest: entry.priorValueDigest,
          ...(entry.priorRecords !== undefined
            ? {
                prior_records: entry.priorRecords.map((rec) => ({
                  response_id: rec.responseId,
                  ...(rec.responseHash !== undefined ? { response_hash: rec.responseHash } : {}),
                })),
              }
            : {}),
        })),
        ...(input.refillFields !== undefined ? { refill_fields: [...input.refillFields] } : {}),
        ...(input.refillValues !== undefined ? { refill_values: { ...input.refillValues } } : {}),
        ...(input.refreshOptionSnapshot !== undefined
          ? { refresh_option_snapshot: input.refreshOptionSnapshot }
          : {}),
      });
      const res = await this.sendRaw(
        input.key.scope,
        'POST',
        `/drafts/${encodeURIComponent(parsedRev.draftId)}/repin`,
        { rawBody: body, signal },
      );
      if (res.status === 200) {
        const view = parseDraftView(res.parsed);
        if (!view) return { status: 'unavailable' };
        const draft = extractDraftRecord(view, res.rawText);
        if (!draft) return { status: 'unavailable' };
        return { status: 'repinned', draft };
      }
      if (res.status === 409) {
        const instance = extractPinUnavailableInstance(res.problem);
        if (instance) return { status: 'pin-unavailable', instance };
        return { status: 'conflict' };
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        return { status: 'denied' };
      }
      return { status: 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  readSummaries = async (
    queries: readonly FilingDraftQuery[],
    input: { previewScope: string | undefined; signal: AbortSignal },
  ): Promise<ReadonlyMap<string, FilingStatusObservation>> => {
    const unavailableMap = (): Map<string, FilingStatusObservation> =>
      new Map(
        queries.map((q) => [
          q.key,
          { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } },
        ]),
      );
    if (queries.length === 0) return new Map();

    const scope = input.previewScope ?? '';
    try {
      const payload = JSON.stringify({
        includeFilings: this.includeFilings,
        queries: queries.map((query) => ({
          key: query.key,
          definitionUrl: query.definitionUrl,
          definitionVersion: query.definitionVersion,
          ...(query.subject !== undefined
            ? { subject: { type: query.subject.type, keys: { ...query.subject.keys } } }
            : {}),
          sections: query.sections.map((section) => ({
            id: section.id ?? '',
            fields: [...section.fields],
          })),
        })),
      });
      const res = await this.sendRaw(scope, 'POST', '/drafts/progress', {
        rawBody: payload,
        signal: input.signal,
      });
      if (res.status !== 200 || !isRecord(res.parsed) || !isRecord(res.parsed.results)) {
        return unavailableMap();
      }
      const resultsObj = res.parsed.results;
      const filingsObj = isRecord(res.parsed.filings) ? res.parsed.filings : undefined;
      const out = new Map<string, FilingStatusObservation>();
      for (const query of queries) {
        const draft = parseDraftObservation(resultsObj[query.key]);
        const filing = parseFilingObservation(filingsObj?.[query.key]);
        out.set(query.key, { draft, filing });
      }
      return out;
    } catch {
      return unavailableMap();
    }
  };
}

export interface HttpResponseSelectorConfig {
  readonly baseUrl: string;
  readonly scopeKey?: ScopeKey;
  readonly accessToken?: string | AccessTokenProvider;
  readonly fetchImpl?: FetchLike;
}

/**
 * Live `@formspec-org/types` `ResponseSelector` calling `formspec-server`'s `POST /responses/select`.
 */
export class HttpResponseSelector implements ResponseSelector {
  private readonly baseUrl: string;
  private readonly scopeKey?: ScopeKey;
  private readonly accessToken?: string | AccessTokenProvider;
  private readonly fetchImpl: FetchLike;

  constructor(config: HttpResponseSelectorConfig) {
    if (!config.baseUrl.trim()) {
      throw new Error('HttpResponseSelector baseUrl is required');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.scopeKey = config.scopeKey === undefined ? undefined : parseScopeKey(config.scopeKey);
    this.accessToken = config.accessToken;
    this.fetchImpl = config.fetchImpl ?? defaultFetch();
  }

  async select(
    requests: readonly ResponseSelectionRequest[],
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, ResponseSelectionOutcome>> {
    const out = new Map<string, ResponseSelectionOutcome>();
    const token =
      typeof this.accessToken === 'function' ? await this.accessToken() : this.accessToken;

    await Promise.all(
      requests.map(async (req) => {
        if (req.kind !== 'catalog') {
          out.set(req.key, { status: 'unavailable' });
          return;
        }
        try {
          const headers = new Headers();
          headers.set('accept', 'application/json');
          headers.set('content-type', 'application/json');
          for (const [name, value] of Object.entries(scopeKeyHeaders(this.scopeKey))) {
            headers.set(name, value);
          }
          if (token) {
            headers.set('authorization', `Bearer ${token}`);
          }
          const body = JSON.stringify({
            key: req.key,
            kind: 'catalog',
            catalogRef: req.catalogRef,
            catalogDigest: req.catalogDigest,
            sourceRef: req.sourceRef,
            ...(req.routeParams !== undefined ? { routeParams: { ...req.routeParams } } : {}),
            ...(req.consumerSubject !== undefined
              ? { consumerSubject: { ...req.consumerSubject } }
              : {}),
            ...(req.pin !== undefined ? { pin: req.pin } : {}),
          });
          const response = await this.fetchImpl(`${this.baseUrl}/responses/select`, {
            method: 'POST',
            redirect: 'error',
            headers,
            signal,
            body,
          });
          if (!response.ok) {
            out.set(req.key, { status: 'unavailable' });
            return;
          }
          const rawText = await response.text();
          out.set(req.key, parseSelectionOutcome(parseJsonExact(rawText)));
        } catch {
          out.set(req.key, { status: 'unavailable' });
        }
      }),
    );

    return out;
  }
}
