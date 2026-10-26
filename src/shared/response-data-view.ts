import { canonicalFiniteJson, snapshotFiniteJson } from '@formspec-org/surface';

/** Compare parsed answer views while retaining the exact Response for commitments. */
export function sameResponseDataView(canonicalData: unknown, displayedData: unknown): boolean {
  if (canonicalData === undefined || displayedData === undefined) return false;
  // Source keeps these answer/evaluation views as ordinary numbers. As in static
  // task presentation, JSON.parse is deliberate here; its result is never hashed.
  const display = (value: unknown) => snapshotFiniteJson(JSON.parse(JSON.stringify(snapshotFiniteJson(value))));
  return canonicalFiniteJson(display(canonicalData)) === canonicalFiniteJson(display(displayedData));
}
