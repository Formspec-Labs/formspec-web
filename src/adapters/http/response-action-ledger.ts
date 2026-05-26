import canonicalize from 'canonicalize';
import {
  invokeResponseAction,
  type ResponseActionEffectOutcome,
  type ResponseActionInvocationContext,
  type ResponseActionInvocationPorts,
  type ResponseActionInvocationResult,
  type ResponseActionLifecycleKind,
  type ResponseActionLifecyclePayload,
} from '@formspec-org/engine';
import type {
  ResponseActionInvoker,
  ResponseActionInvokerResult,
  SubmitResult,
} from '@formspec-org/react';
import type { TenantBindingConfig } from '../../config/types.ts';
import type {
  ResponseActionInvokerFactory,
  ResponseActionRuntimeContext,
} from '../../ports/response-action-ledger.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import type { AnonymousSession } from './anonymous-session.ts';
import {
  defaultFormIdResolver,
  type FormIdResolver,
} from './form-id.ts';
import type { FetchLike } from './http-client.ts';

export const RESPONSE_ACTION_LEDGER_APPEND_ROUTE =
  '/runtime/response-actions/ledger/session-op-batches';
export const RESPONSE_ACTION_LEDGER_CAPABILITY_HEADER =
  'x-formspec-runtime-ledger-capability';

export type LedgerAppendMode = 'require-anchored';
export type AuthorActorKind = 'human' | 'ai-agent' | 'service';
export type AuthorActorChannel = 'human' | 'mcp' | 'agent' | 'service';

export interface AuthorActor {
  id: string;
  kind: AuthorActorKind;
  actChannel: AuthorActorChannel;
}

export interface SessionRef {
  id: string;
  openedAt: string;
  actors: string[];
}

export type ResponseActionLifecycleSemanticOp = {
  op: 'responseAction.lifecycle';
  kind: ResponseActionLifecycleKind;
  payload: ResponseActionLifecyclePayload;
};

export type ResponseActionEffectOutcomeSemanticOp = {
  op: 'responseAction.effectOutcome';
  actionId: string;
  invocationId: string;
  effectIndex: number;
  effectType: ResponseActionEffectOutcome['type'];
  status: ResponseActionEffectOutcome['status'];
  idempotencyKey?: string;
  outcomeRef?: string;
  reason?: string;
  replayToken?: string;
};

export type ResponseActionInvocationSemanticOp = {
  op: 'responseAction.invocation';
  actionId: string;
  invocationId: string;
  status: ResponseActionInvocationResult<unknown>['status'];
  blockedCause?: ResponseActionInvocationResult<unknown>['blockedCause'];
  blockedPreconditionId?: string;
  deferredPreconditionId?: string;
  failedPreconditionId?: string;
  failedEffectIndex?: number;
  deferredEffectIndex?: number;
  failureReason?: string;
  replayToken?: string;
  durableEffectCount: number;
};

export type ResponseActionSemanticOp =
  | ResponseActionLifecycleSemanticOp
  | ResponseActionEffectOutcomeSemanticOp
  | ResponseActionInvocationSemanticOp;

export interface SessionOpBatch {
  version: string;
  sessionRef: SessionRef;
  branchId: string;
  actor: AuthorActor;
  artifactRefs: string[];
  previousHeads: string[];
  newHeads: string[];
  semanticOps: ResponseActionSemanticOp[];
  changeHashes: string[];
}

export interface ResponseActionSessionOpBatchAppendCommand {
  ledgerScope: string;
  sessionRef: SessionRef;
  branchId: string;
  opBatch: SessionOpBatch;
  opBatchHash: string;
  idempotencyKey: string;
  mode: LedgerAppendMode;
}

export interface ResponseActionLedgerAppendReceipt {
  ledgerScope: string;
  priorEventHash: string | null;
  eventHash: string;
  idempotencyKey: string;
  status: 'anchored';
  substrateEventId?: string;
  sequence?: number;
  checkpointReference?: string;
  bundleRef?: string;
}

export interface ResponseActionLedgerCapabilityRequest {
  context: ResponseActionRuntimeContext;
  formId: string;
  anonymousSession: AnonymousSession;
  appendCommand: ResponseActionSessionOpBatchAppendCommand;
}

export type ResponseActionLedgerCapabilityProvider = (
  request: ResponseActionLedgerCapabilityRequest,
) => string | Promise<string>;

export interface HttpResponseActionLedgerInvokerOptions {
  endpoint: string;
  tenantBinding?: TenantBindingConfig;
  anonymousSessions: {
    sessionForForm(formUrl: string, version?: string): Promise<AnonymousSession>;
  };
  capabilityProvider: ResponseActionLedgerCapabilityProvider;
  fetchImpl?: FetchLike;
  formIdResolver?: FormIdResolver;
  branchId?: string | ((context: ResponseActionRuntimeContext) => string);
  actor?: AuthorActor | ((context: ResponseActionRuntimeContext, session: AnonymousSession) => AuthorActor);
  artifactRefs?: string[] | ((context: ResponseActionRuntimeContext) => string[]);
  previousHeads?: string[] | ((context: ResponseActionRuntimeContext) => string[]);
  newHeads?: string[] | ((context: ResponseActionRuntimeContext) => string[]);
  changeHashes?: string[] | ((context: ResponseActionRuntimeContext) => string[]);
  invocationId?: (
    context: ResponseActionRuntimeContext,
    input: Parameters<ResponseActionInvoker<SubmitResult>>[0],
  ) => string;
  now?: () => string;
}

export function createHttpResponseActionLedgerInvokerFactory(
  options: HttpResponseActionLedgerInvokerOptions,
): ResponseActionInvokerFactory {
  const formIdResolver = options.formIdResolver ?? defaultFormIdResolver;

  return (context) => {
    if (context.claim && !context.claim.subjectRef.startsWith('anon:')) {
      return null;
    }

    return async (input) => {
      const anonymousSession = await options.anonymousSessions.sessionForForm(
        context.runtimeDefinitionUrl,
        context.definition.version,
      );
      assertAnonymousSubjectMatches(context, anonymousSession);

      const invocationContext: ResponseActionInvocationContext = {
        invocationId: options.invocationId?.(context, input),
      };
      const ledgerInvocation = await invokeWithLedger({
        context,
        input,
        anonymousSession,
        invocationContext,
        branchId: valueFor(options.branchId, context) ?? 'branch-main',
        actor: actorFor(options.actor, context, anonymousSession),
        artifactRefs: valueFor(options.artifactRefs, context) ?? [
          `formspec-definition:${context.definition.url}`,
        ],
        previousHeads: valueFor(options.previousHeads, context) ?? [],
        newHeads: valueFor(options.newHeads, context) ?? [],
        changeHashes: valueFor(options.changeHashes, context) ?? [],
        now: options.now ?? (() => new Date().toISOString()),
      });
      if (!ledgerInvocation.command) {
        return ledgerInvocation.invocation;
      }

      const capability = await options.capabilityProvider({
        context,
        formId: formIdResolver(context.runtimeDefinitionUrl, context.definition.version),
        anonymousSession,
        appendCommand: ledgerInvocation.command,
      });
      await appendSessionOpBatch({
        endpoint: options.endpoint,
        tenantBinding: options.tenantBinding,
        fetchImpl: options.fetchImpl,
        capability,
        appendCommand: ledgerInvocation.command,
      });
      return {
        invocation: ledgerInvocation.invocation,
      } satisfies ResponseActionInvokerResult<SubmitResult>;
    };
  };
}

async function invokeWithLedger(input: {
  context: ResponseActionRuntimeContext;
  input: Parameters<ResponseActionInvoker<SubmitResult>>[0];
  anonymousSession: AnonymousSession;
  invocationContext: ResponseActionInvocationContext;
  branchId: string;
  actor: AuthorActor;
  artifactRefs: string[];
  previousHeads: string[];
  newHeads: string[];
  changeHashes: string[];
  now: () => string;
}): Promise<{
  invocation: ResponseActionInvocationResult<SubmitResult>;
  command: ResponseActionSessionOpBatchAppendCommand | null;
}> {
  const lifecycleOps: ResponseActionLifecycleSemanticOp[] = [];
  const upstreamLifecycleRecorder = input.input.ports.recordActionLifecycle;
  const ports: ResponseActionInvocationPorts<SubmitResult> = {
    ...input.input.ports,
    recordActionLifecycle(kind, payload) {
      lifecycleOps.push({
        op: 'responseAction.lifecycle',
        kind,
        payload: structuredClone(payload),
      });
      upstreamLifecycleRecorder?.(kind, payload);
    },
  };
  const invocation = invokeResponseAction(
    input.input.document,
    input.input.actionRef,
    ports,
    input.input.nodeId,
    input.invocationContext,
  );
  const action = invocation.resolution.action;
  if (!invocation.resolution.resolved || !action) {
    return { invocation, command: null };
  }

  const invocationId = lifecycleOps[0]?.payload.invocationId
    ?? input.invocationContext.invocationId
    ?? `${action.id}:unknown-invocation`;
  const durableEffectOps = effectOutcomeSemanticOps(action.id, invocationId, invocation.effectTrace);
  const semanticOps: ResponseActionSemanticOp[] = [
    ...lifecycleOps,
    ...durableEffectOps,
    invocationSemanticOp(invocation, action.id, invocationId, durableEffectOps.length),
  ];
  const ledgerScope = `urn:formspec:session:${input.anonymousSession.sessionId}`;
  const sessionRef: SessionRef = {
    id: ledgerScope,
    openedAt: input.now(),
    actors: [input.actor.id],
  };
  const opBatch: SessionOpBatch = {
    version: '1.0.0',
    sessionRef,
    branchId: input.branchId,
    actor: input.actor,
    artifactRefs: input.artifactRefs,
    previousHeads: input.previousHeads,
    newHeads: input.newHeads,
    semanticOps,
    changeHashes: input.changeHashes,
  };
  const opBatchHash = await computeJcsSha256Digest(opBatch);
  const command: ResponseActionSessionOpBatchAppendCommand = {
    ledgerScope,
    sessionRef,
    branchId: input.branchId,
    opBatch,
    opBatchHash,
    idempotencyKey: await studioLedgerIdempotencyKey(ledgerScope, input.branchId, opBatchHash),
    mode: 'require-anchored',
  };
  return { invocation, command };
}

function effectOutcomeSemanticOps(
  actionId: string,
  invocationId: string,
  effectTrace: ResponseActionEffectOutcome[],
): ResponseActionEffectOutcomeSemanticOp[] {
  return effectTrace.flatMap((outcome, effectIndex) => {
    if (outcome.type === 'hostEvent') return [];
    return [definedProps({
      op: 'responseAction.effectOutcome',
      actionId,
      invocationId,
      effectIndex,
      effectType: outcome.type,
      status: outcome.status,
      idempotencyKey: outcome.idempotencyKey,
      outcomeRef: outcome.outcomeRef,
      reason: outcome.reason,
      replayToken: outcome.replayToken,
    }) as ResponseActionEffectOutcomeSemanticOp];
  });
}

function invocationSemanticOp(
  invocation: ResponseActionInvocationResult<SubmitResult>,
  actionId: string,
  invocationId: string,
  durableEffectCount: number,
): ResponseActionInvocationSemanticOp {
  return definedProps({
    op: 'responseAction.invocation',
    actionId,
    invocationId,
    status: invocation.status,
    blockedCause: invocation.blockedCause,
    blockedPreconditionId: invocation.blockedPreconditionId,
    deferredPreconditionId: invocation.deferredPreconditionId,
    failedPreconditionId: invocation.failedPreconditionId,
    failedEffectIndex: invocation.failedEffectIndex,
    deferredEffectIndex: invocation.deferredEffectIndex,
    failureReason: invocation.failureReason,
    replayToken: invocation.replayToken,
    durableEffectCount,
  }) as ResponseActionInvocationSemanticOp;
}

async function appendSessionOpBatch(input: {
  endpoint: string;
  tenantBinding?: TenantBindingConfig;
  fetchImpl?: FetchLike;
  capability: string;
  appendCommand: ResponseActionSessionOpBatchAppendCommand;
}): Promise<ResponseActionLedgerAppendReceipt> {
  if (!input.capability || input.capability.trim() !== input.capability) {
    throw new Error('Response Actions Ledger capability must be a non-empty trimmed string.');
  }
  const fetchImpl = fetchFor(input.fetchImpl);
  const headers = new Headers(tenantHeaders(input.tenantBinding));
  headers.set('content-type', 'application/json');
  headers.set(RESPONSE_ACTION_LEDGER_CAPABILITY_HEADER, input.capability);
  const response = await fetchImpl(routeUrl(input.endpoint, RESPONSE_ACTION_LEDGER_APPEND_ROUTE), {
    method: 'POST',
    headers,
    body: JSON.stringify(input.appendCommand),
  });
  if (!response.ok) {
    throw new Error(
      `Response Actions Ledger append failed (${response.status}): ${await problemDetail(response)}`,
    );
  }
  return parseAnchoredReceipt(await response.json());
}

function parseAnchoredReceipt(payload: unknown): ResponseActionLedgerAppendReceipt {
  if (!isRecord(payload) || payload.status !== 'anchored') {
    throw new Error('Response Actions Ledger append response must be an anchored JSON object.');
  }
  return {
    ledgerScope: stringField(payload, 'ledgerScope'),
    priorEventHash: nullableStringField(payload, 'priorEventHash'),
    eventHash: stringField(payload, 'eventHash'),
    idempotencyKey: stringField(payload, 'idempotencyKey'),
    status: 'anchored',
    substrateEventId: optionalStringField(payload, 'substrateEventId'),
    sequence: optionalNumberField(payload, 'sequence'),
    checkpointReference: optionalStringField(payload, 'checkpointReference'),
    bundleRef: optionalStringField(payload, 'bundleRef'),
  };
}

export async function computeJcsSha256Digest(value: unknown): Promise<string> {
  const text = canonicalize(value);
  if (typeof text !== 'string') {
    throw new Error('canonicalize() returned non-string for the supplied value');
  }
  return sha256Prefixed(new TextEncoder().encode(text));
}

async function studioLedgerIdempotencyKey(
  ledgerScope: string,
  branchId: string,
  opBatchHash: string,
): Promise<string> {
  const material = [ledgerScope, branchId, opBatchHash]
    .map((part) => `${part.length}:${part}`)
    .join('|');
  return sha256Prefixed(new TextEncoder().encode(material));
}

async function sha256Prefixed(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SHA-256 is required for Response Actions Ledger append hashing.');
  }
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', source);
  return `sha256:${Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function actorFor(
  configured: HttpResponseActionLedgerInvokerOptions['actor'],
  context: ResponseActionRuntimeContext,
  session: AnonymousSession,
): AuthorActor {
  if (typeof configured === 'function') return configured(context, session);
  if (configured) return configured;
  return {
    id: `urn:formspec:actor:human:${session.subjectRef}`,
    kind: 'human',
    actChannel: 'human',
  };
}

function assertAnonymousSubjectMatches(
  context: ResponseActionRuntimeContext,
  session: AnonymousSession,
): void {
  const expectedSubject = context.claim?.subjectRef ?? context.draftKey.subjectRef;
  if (expectedSubject && expectedSubject !== session.subjectRef) {
    throw new Error('Response Actions Ledger anonymous session subject does not match the active respondent subject.');
  }
}

function valueFor<T>(
  value: T | ((context: ResponseActionRuntimeContext) => T) | undefined,
  context: ResponseActionRuntimeContext,
): T | undefined {
  return typeof value === 'function'
    ? (value as (context: ResponseActionRuntimeContext) => T)(context)
    : value;
}

function definedProps<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function fetchFor(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  if (!globalThis.fetch) {
    throw new Error('Response Actions Ledger HTTP adapter requires a fetch implementation.');
  }
  return globalThis.fetch.bind(globalThis);
}

function tenantHeaders(binding?: TenantBindingConfig): HeadersInit {
  return binding ? tenantScopeHeaders(binding) : {};
}

function routeUrl(endpoint: string, route: string): string {
  return `${endpoint.replace(/\/+$/, '')}${route}`;
}

async function problemDetail(response: Response): Promise<string> {
  try {
    const value = await response.json();
    if (isRecord(value) && typeof value.detail === 'string') return value.detail;
    if (isRecord(value) && typeof value.title === 'string') return value.title;
  } catch {
    // Status text is enough when the response body is empty or non-JSON.
  }
  return response.statusText || `HTTP ${response.status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, field: string): string {
  const entry = value[field];
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error(`Response Actions Ledger append response missing string field: ${field}.`);
  }
  return entry;
}

function nullableStringField(value: Record<string, unknown>, field: string): string | null {
  const entry = value[field];
  if (entry === null || entry === undefined) return null;
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error(`Response Actions Ledger append response has invalid field: ${field}.`);
  }
  return entry;
}

function optionalStringField(value: Record<string, unknown>, field: string): string | undefined {
  const entry = value[field];
  return typeof entry === 'string' && entry.length > 0 ? entry : undefined;
}

function optionalNumberField(value: Record<string, unknown>, field: string): number | undefined {
  const entry = value[field];
  return typeof entry === 'number' ? entry : undefined;
}
