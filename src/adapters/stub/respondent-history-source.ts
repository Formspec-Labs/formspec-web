import type {
  HistorySnapshot,
  RespondentHistorySource,
} from '../../ports/respondent-history-source.ts';
import { isHistorySnapshot } from '../../shared/respondent-history.ts';
import { markDemoStubAdapter } from '../../policy/sentinel.ts';

export function stubRespondentHistorySource(
  initialSnapshot: HistorySnapshot = emptyHistorySnapshot(),
): RespondentHistorySource & {
  replaceSnapshot(snapshot: HistorySnapshot): void;
} {
  let snapshot = cloneJson(initialSnapshot);
  assertHistorySnapshot(snapshot);

  const adapter: RespondentHistorySource & {
    replaceSnapshot(snapshot: HistorySnapshot): void;
  } = {
    replaceSnapshot(nextSnapshot) {
      assertHistorySnapshot(nextSnapshot);
      snapshot = cloneJson(nextSnapshot);
    },
    async readHistory() {
      return cloneJson(snapshot);
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'crossIssuerHistory',
    reason: 'demo-only respondent-history fixture; not valid for production',
  });
  return adapter;
}

export function emptyHistorySnapshot(subjectRef = 'respondent:anonymous'): HistorySnapshot {
  return {
    $formspecRespondentHistory: '1.0',
    aggregationMode: 'client-wallet',
    subjectRef,
    entries: [],
  };
}

function assertHistorySnapshot(value: unknown): asserts value is HistorySnapshot {
  if (!isHistorySnapshot(value)) {
    throw new Error('stub RespondentHistorySource: invalid HistorySnapshot');
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
