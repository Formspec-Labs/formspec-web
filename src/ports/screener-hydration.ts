import type { EvaluationHydrationWire } from './evaluation-hydration.ts';
import type { SavedResponseDraft } from './response-signing.ts';
import type { ScreenerAssociation, ScreenerOperationContext, ScreenerRunView } from './screener-retention.ts';

export interface HydrateScreenerCandidate extends ScreenerOperationContext {
  readonly saved: SavedResponseDraft;
  readonly run: ScreenerRunView;
  readonly association: ScreenerAssociation;
}
/** Checked readonly facts for one exact saved candidate. This is not server admission authority. */
export interface HydratedScreenerCandidate {
  readonly view: EvaluationHydrationWire;
  readonly assertCurrent: () => void;
  /** All selected sources must be qualified; this does not interpret their business values. */
  readonly assertReady: () => void;
}
export interface ScreenerHydration {
  hydrate(input: HydrateScreenerCandidate): Promise<HydratedScreenerCandidate>;
}
