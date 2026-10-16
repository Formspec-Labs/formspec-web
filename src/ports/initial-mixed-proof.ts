import type { EvaluationHydrationWire } from './evaluation-hydration.ts';

/** Complete original request; publication records retain their owning wire spelling. */
export interface InitialNativeRequest {
  readonly operation: 'hydrate';
  readonly scope: EvaluationHydrationWire['scope'];
  readonly owner: EvaluationHydrationWire['owner'];
  readonly selection: EvaluationHydrationWire['selection'];
  readonly formVersion: Readonly<Record<string, unknown>>;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly canonicalResponse: Readonly<Record<string, unknown>>;
  readonly candidateHash: string;
  readonly requestHash: string;
  readonly sources: Readonly<Record<string, string>>;
}
