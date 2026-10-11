import type { EvaluationHydrationWire, EvaluationProviderRegistration, NativeScreenerMappingReceipt } from './evaluation-hydration.ts';
import type { RetainedScreenerRun, ScreenerAssociation, ScreenerSelection } from './screener-retention.ts';

/** Initial-only V2 wire. Decoding does not qualify any source or confer signing authority. */
export interface InitialMixedHydrationWire extends Omit<EvaluationHydrationWire, 'version' | 'providerReceipt'> {
  readonly version: 2;
  readonly providerReceipt: InitialMixedReceipt;
}
export interface StructuredImageMappingReceipt {
  readonly kind: 'structuredImageMapping';
  readonly version: 1;
  readonly purpose: 'formspec.instance.structured-image.map';
  readonly registration: EvaluationProviderRegistration;
  readonly requestHash: string;
  readonly instanceName: string;
  readonly sourceRef: string;
  readonly evidenceRef: string;
  readonly runHash: string;
  readonly dataHash: string;
  readonly issuedAt: string;
  readonly completedAt: string;
  readonly expiresAt: string;
  readonly receiptHash: string;
}
export interface InitialMixedReceipt {
  readonly kind: 'composedSources';
  readonly version: 2;
  readonly purpose: 'formspec.instance.compose';
  readonly registration: EvaluationProviderRegistration;
  readonly requestHash: string;
  readonly resolvedAt: string;
  readonly validUntil: string | null;
  readonly contributions: readonly {
    readonly instanceName: string;
    readonly sourceRef: string;
    readonly resultHash: string;
    // HTTP task context remains unsupported by this initial consumer.
    readonly receipt: NativeScreenerMappingReceipt | StructuredImageMappingReceipt | null;
  }[];
  readonly receiptHash: string;
}
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
export interface ImmutableObjectBytes {
  readonly object: {
    readonly object_artifact_id: string;
    readonly aggregate_type: 'structured_image_run';
    readonly aggregate_id: string;
    readonly object_kind: 'immutable:structured-image-run:v1' | 'immutable:structured-image-diagnostic:v1';
    readonly object_uri: string;
    readonly content_type: string;
    readonly checksum_sha256: string;
    readonly byte_length: number;
  };
  readonly bytesBase64: string;
}
export type InitialInstanceProof = {
  readonly kind: 'native';
  readonly version: 1;
  readonly instanceName: string;
  readonly request: InitialNativeRequest;
  readonly records: {
    readonly snapshot: {
      readonly selectionHash: string;
      readonly selection: ScreenerSelection;
      readonly formVersion: Readonly<Record<string, unknown>>;
      readonly screenerBytes: readonly number[];
    };
    readonly run: RetainedScreenerRun;
    readonly association: ScreenerAssociation;
  };
} | {
  readonly kind: 'image';
  readonly version: 1;
  readonly instanceName: string;
  readonly request: InitialNativeRequest;
  readonly run: ImmutableObjectBytes;
  readonly diagnostics: readonly ImmutableObjectBytes[];
};
