import { resolveDataSourceDescriptor, snapshotFiniteJson, type DataSourceCatalogHandle } from '@formspec-org/surface';
import { SIGNING_CEREMONY_WIDGET_SHAPE, type SigningCeremonyData } from '@formspec-org/surface-react';
import { createFrozenHostStateDataSourceRuntime, type FrozenHostStateDataInput } from './frozen-host-state-data.ts';

export interface ResponseSigningDataInput extends Omit<FrozenHostStateDataInput, 'entries' | 'recordId' | 'revision'> {
  catalogs: readonly DataSourceCatalogHandle[];
  bindings: Readonly<Record<string, { catalogRef: string; sourceRef: string }>>;
  /** A single host-verified ceremony snapshot, never values taken from widget input. */
  snapshot: SigningCeremonyData;
}

/** Register the maintained ceremony input names against exact authored sources.
 * The provenance names identify this producer; the bundle and private host
 * context still supply admission and ownership.
 */
export function createResponseSigningDataSourceRuntime(input: ResponseSigningDataInput) {
  const snapshot = snapshotFiniteJson(input.snapshot) as unknown as SigningCeremonyData;
  const values = snapshot as unknown as Readonly<Record<string, unknown>>;
  const names = new Set(SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs.map(field => field.name));
  if (Object.keys(input.bindings).some(name => !names.has(name)) || Object.keys(values).some(name => !names.has(name))) {
    throw new Error('Signing delivery contains an undeclared ceremony input');
  }
  const entries = SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs.flatMap(field => {
    const binding = input.bindings[field.name];
    if (!binding || !Object.hasOwn(values, field.name)) {
      if (field.required) throw new Error('Signing delivery is missing a required ceremony input');
      return [];
    }
    const descriptor = resolveDataSourceDescriptor(input.catalogs, binding);
    if (!descriptor || descriptor.source.runtime.provenance.source !== `admitted-signing-cohort:${field.name}`) {
      throw new Error('Signing delivery source does not match its registered producer');
    }
    return [{ descriptor, value: values[field.name] }];
  });
  return createFrozenHostStateDataSourceRuntime({
    entries, generation: input.generation, recordId: snapshot.draft.id, revision: snapshot.draft.version,
    assertCurrent: input.assertCurrent, validatePayload: input.validatePayload,
  });
}
