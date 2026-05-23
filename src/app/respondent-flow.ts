import type {
  FormDefinition,
  FormResponse,
  IntakeHandoff,
  ValidationReport,
} from '@formspec-org/types';
import type { IFormEngine } from '@formspec-org/engine';
import type { DraftKey } from '../ports/draft-store.ts';
import type { IdentityClaim } from '../ports/identity-provider.ts';
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
      'x-formspec-draft-key': draftKey,
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
