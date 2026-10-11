import type { HydratedEvaluationCandidate } from './evaluation-hydration.ts';
import type { SavedResponseDraft } from './response-signing.ts';
import type { ScreenerAssociation, ScreenerOperationContext, ScreenerRunView, NativeCurrentCheck } from './screener-retention.ts';

interface ScreenerCandidate extends ScreenerOperationContext {
  readonly saved: SavedResponseDraft;
  readonly run: ScreenerRunView;
}
export type HydrateScreenerCandidate = ScreenerCandidate & (
  | { readonly association: ScreenerAssociation; readonly nativeCurrentCheck?: never }
  | { readonly association?: never; readonly nativeCurrentCheck: NativeCurrentCheck }
);
export interface ScreenerHydration {
  retireFacts?(): void;
  dispose?(): void;
  hydrate(input: HydrateScreenerCandidate): Promise<HydratedEvaluationCandidate>;
}
