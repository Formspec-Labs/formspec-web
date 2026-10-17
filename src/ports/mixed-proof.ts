import type { EvaluationHydrationWire, EvaluationProviderRegistration } from './evaluation-hydration.ts';
/** Complete Source V4 receipt; leaf contents remain owning proof inputs. */
export interface MixedHydrationReceipt {
  readonly kind: 'composedSources'; readonly version: 4; readonly purpose: 'formspec.instance.compose';
  readonly registration: EvaluationProviderRegistration; readonly requestHash: string;
  readonly resolvedAt: string; readonly validUntil: string | null; readonly receiptHash: string;
  readonly contributions: readonly { readonly instanceName: string; readonly sourceRef: string;
    readonly resultHash: string; readonly receipt: Readonly<Record<string, unknown>> | null }[];
}
export interface MixedHydrationWire extends Omit<EvaluationHydrationWire, 'version' | 'providerReceipt'> {
  readonly version: 2; readonly providerReceipt: MixedHydrationReceipt;
}
