/**
 * The single source of truth tying every RuntimeFeatureKey to the
 * Composition port slot that backs it. Each future feature ADR adds its
 * (key, portName) entry here so the coherence assertion picks it up
 * automatically.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export const FEATURE_PORT_MAP = {
  respondentPlace: 'respondentPlaceSource',
  status: 'statusReader',
} as const satisfies Readonly<Record<RuntimeFeatureKey, string>>;

export type CompositionPortName = (typeof FEATURE_PORT_MAP)[RuntimeFeatureKey];
