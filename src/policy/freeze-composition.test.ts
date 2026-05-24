import { describe, expect, it } from 'vitest';
import { freezeComposition, CompositionIncoherenceError } from './composition-coherence.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';

describe('freezeComposition — boot-time funnel for composition-coherence', () => {
  it('returns the same reference when the composition is coherent', () => {
    const composition = {
      mode: 'demo' as const,
      instanceCapabilities: {
        respondentPlace: 'demo-stub',
        status: 'demo-stub',
        // FW-0056 design line 121 + arch-review MED-1: no demo VP stack;
        // documentPresentation 'unavailable' opts out of the shared
        // respondentPlaceSource slot, so the demo-stub place adapter
        // satisfies only the respondentPlace key.
        documentPresentation: 'unavailable',
      } as const,
      respondentPlaceSource: stubRespondentPlaceSource(),
      statusReader: stubStatusReader(),
    };
    expect(freezeComposition(composition)).toBe(composition);
  });

  it('throws CompositionIncoherenceError when production composition wires a demo-stub', () => {
    const composition = {
      mode: 'production' as const,
      instanceCapabilities: {
        respondentPlace: 'unavailable',
        status: 'available',
        documentPresentation: 'unavailable',
      } as const,
      respondentPlaceSource: unavailableRespondentPlaceSource(),
      statusReader: stubStatusReader(),
    };
    expect(() => freezeComposition(composition)).toThrow(CompositionIncoherenceError);
  });
});
