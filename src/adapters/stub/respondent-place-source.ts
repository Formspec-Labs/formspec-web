import type {
  RespondentPlaceSnapshot,
  RespondentPlaceSource,
} from '../../ports/respondent-place-source.ts';
import { isRespondentPlaceSnapshot } from '../../shared/respondent-place.ts';

export function stubRespondentPlaceSource(
  initialSnapshot: RespondentPlaceSnapshot = emptyRespondentPlaceSnapshot(),
): RespondentPlaceSource & {
  replaceSnapshot(snapshot: RespondentPlaceSnapshot): void;
} {
  let snapshot = cloneJson(initialSnapshot);
  assertRespondentPlaceSnapshot(snapshot);

  return {
    replaceSnapshot(nextSnapshot) {
      assertRespondentPlaceSnapshot(nextSnapshot);
      snapshot = cloneJson(nextSnapshot);
    },
    async readPlace() {
      return cloneJson(snapshot);
    },
  };
}

export function emptyRespondentPlaceSnapshot(subjectRef = 'respondent:anonymous'): RespondentPlaceSnapshot {
  return {
    $formspecRespondentLibrary: '1.0',
    version: '1.0.0',
    libraryId: 'urn:formspec:respondent-library:empty',
    subject: {
      subjectRef,
      privacyTier: 'pseudonymous',
    },
    aggregationMode: 'client-wallet',
    trustModel: {
      storagePosture: 'client-local-only',
      issuerIsolation: 'per-issuer',
      serverAggregation: 'forbidden',
      presentationDefault: 'explicit-consent',
    },
    obligations: [],
    documents: [],
    submissions: [],
    presentationPolicies: [],
  };
}

function assertRespondentPlaceSnapshot(value: unknown): asserts value is RespondentPlaceSnapshot {
  if (!isRespondentPlaceSnapshot(value)) {
    throw new Error('stub RespondentPlaceSource: invalid Respondent Library snapshot');
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
