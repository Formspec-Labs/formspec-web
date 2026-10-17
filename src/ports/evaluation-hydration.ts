import type { MixedHydrationWire } from './mixed-proof.ts';
import type { SavedResponseDraft } from './response-signing.ts';
import type { CompletionLifetime } from './response-completion.ts';
import type { ScreenerAssociation, ScreenerOwner, ScreenerSelection, SourceScope, NativeCurrentCheck } from './screener-retention.ts';

/** Public Source wire types only. Schema validity does not establish candidate or freshness authority. */
export interface EvaluationHydrationOwner {
  readonly sessionId: string;
  readonly subjectRef: string;
  readonly authenticated: ScreenerOwner['authenticated'] | null;
}
export interface EvaluationProviderRegistration {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly registrationHash: string;
  readonly outputSchemaHash: string;
  readonly maxEvidenceAgeSeconds: number;
  readonly maxValiditySeconds: number;
  /** Opaque original Source policy; consumers must preserve rather than interpret its business rules. */
  readonly publicDescriptor: Readonly<Record<string, unknown>>;
}
export interface HttpEvaluationProviderReceipt {
  readonly registration: EvaluationProviderRegistration;
  readonly requestHash: string;
  readonly callHash: string;
  readonly requestedAt: string;
  readonly responseStatus: 200;
  readonly attachments: readonly {
    readonly reference: unknown;
    readonly hash: string;
    readonly contentType: string;
    readonly size: number;
  }[];
}
export interface NativeScreenerMappingReceipt {
  readonly kind: 'nativeScreenerMapping';
  readonly version: 1;
  readonly purpose: 'formspec.instance.native-screener.map';
  readonly registration: EvaluationProviderRegistration;
  readonly requestHash: string;
  readonly resolvedAt: string;
  readonly proof: {
    readonly association: ScreenerAssociation;
    readonly evidenceRef: string;
    readonly evidenceHash: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly instanceName: string;
    readonly sourceRef: string;
    readonly dataHash: string;
  };
  readonly receiptHash: string;
}
/** First admitted composition cut: one native owner and explicit unavailable owners. */
export interface ComposedSourcesReceipt {
  readonly kind: 'composedSources';
  readonly version: 1;
  readonly purpose: 'formspec.instance.compose';
  readonly registration: EvaluationProviderRegistration;
  readonly requestHash: string;
  readonly resolvedAt: string;
  readonly validUntil: string | null;
  readonly contributions: readonly {
    readonly instanceName: string;
    readonly sourceRef: string;
    readonly resultHash: string;
    readonly receipt: NativeScreenerMappingReceipt | null;
  }[];
  readonly receiptHash: string;
}
export type EvaluationHydrationResult = {
  readonly status: 'qualified';
  readonly instanceName: string;
  readonly sourceRef: string;
  readonly data: unknown;
  readonly dataHash: string;
  readonly evidenceRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
} | {
  readonly status: 'pending' | 'unavailable';
  readonly instanceName: string;
  readonly sourceRef: string;
  readonly reason: string;
};
export interface EvaluationHydrationWire {
  readonly version: 1;
  readonly purpose: 'formspec.instance.hydrate';
  readonly operation: 'hydrate';
  readonly scope: SourceScope;
  readonly owner: EvaluationHydrationOwner;
  readonly selection: ScreenerSelection['evaluationSelection'];
  readonly draftId: string;
  readonly draftVersion: number;
  readonly candidateHash: string;
  readonly formVersionHash: string;
  readonly requestHash: string;
  readonly sources: Readonly<Record<string, string>>;
  readonly attachmentBindings: readonly unknown[];
  readonly qualifiedAt: string;
  readonly results: readonly EvaluationHydrationResult[];
  readonly providerReceipt: HttpEvaluationProviderReceipt | NativeScreenerMappingReceipt | ComposedSourcesReceipt | null;
}

/** Checked facts for one exact saved candidate; Source retains admission authority. */
export interface HydratedEvaluationCandidate {
  readonly nativeCurrentCheck?: NativeCurrentCheck;
  readonly view: EvaluationHydrationWire | MixedHydrationWire;
  readonly assertCurrent: () => void;
  readonly assertReady: () => void;
  /** Verified monotonic lifetime remaining; absence means unknown, explicit Infinity means nonexpiring. */
  readonly remainingMilliseconds?: () => number;
  /** Local verified lifetime decision; authority retirement still throws. */
  readonly refreshRequired?: () => boolean;
}
/** Host-selected candidate facts, independent of entry routing or Screener retention. */
export interface SavedCandidateHydration {
  qualifySaved(saved: SavedResponseDraft, lifetime: CompletionLifetime): Promise<HydratedEvaluationCandidate>;
  retireFacts(): void;
  dispose(): void;
}
