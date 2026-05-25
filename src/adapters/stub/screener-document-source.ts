/**
 * In-memory ScreenerDocumentSource for demo + tests (FW-0046 slice 1).
 *
 * Backed by a `Map<url, ScreenerDocumentInput>`; lookups ignore the
 * optional version (the demo catalog publishes one revision per URN).
 * Production-grade catalog adapters fan out per their transport.
 */
import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import {
  ScreenerDocumentNotFoundError,
  type ScreenerDocumentInput,
  type ScreenerDocumentQuery,
  type ScreenerDocumentSource,
} from '../../ports/screener-document-source.ts';
import { isScreenerDocumentInput } from '../../shared/screener-document.ts';

export interface StubScreenerDocumentSource extends ScreenerDocumentSource {
  /** Registers (or replaces) the document for the given URN. */
  registerScreener(document: ScreenerDocumentInput): void;
}

export function stubScreenerDocumentSource(
  initial: ReadonlyArray<ScreenerDocumentInput> = [],
): StubScreenerDocumentSource {
  const catalog = new Map<string, ScreenerDocumentInput>();
  for (const document of initial) {
    register(catalog, document);
  }

  const adapter: StubScreenerDocumentSource = {
    registerScreener(document) {
      register(catalog, document);
    },
    async readScreener(query: ScreenerDocumentQuery) {
      const found = catalog.get(query.url);
      if (!found) {
        throw new ScreenerDocumentNotFoundError(query.url);
      }
      return cloneJson(found);
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'screener',
    reason: 'demo-only screener fixture; not valid for production',
  });
  return adapter;
}

function register(
  catalog: Map<string, ScreenerDocumentInput>,
  document: ScreenerDocumentInput,
): void {
  if (!isScreenerDocumentInput(document)) {
    throw new Error('stub ScreenerDocumentSource: invalid ScreenerDocumentInput');
  }
  catalog.set(document.url, cloneJson(document));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
