import { snapshotInput, SMALL_CAP } from './protocol.ts';
export interface MixedProofInputs {
  readonly selectionBytes: Uint8Array;
  readonly hydrationBytes: Uint8Array;
  readonly proofIndexBytes: Uint8Array;
  readonly buffers: readonly Uint8Array[];
}
/** Exact public Source API supplied by the independently selected deployment. */
export interface SourceMixedProofApi {
  initializeMixedProofVerifier(input: { module_or_path: Uint8Array | WebAssembly.Module }): Promise<void>;
  verifyMixedProof(inputs: MixedProofInputs): Uint8Array;
  indexMixedProofObjects(input: { readonly referencesBytes: Uint8Array }): Uint8Array;
}
export type MixedProofCommand =
  | { readonly kind: 'initialize'; readonly id: number; readonly module: Uint8Array<ArrayBuffer> | WebAssembly.Module }
  | { readonly kind: 'index'; readonly id: number; readonly referencesBytes: Uint8Array }
  | { readonly kind: 'verify'; readonly id: number; readonly inputs: MixedProofInputs };
/** Bounds and detaches transport bytes; supplies no proof-index or mapping logic. */
export function snapshotMixedInputs(input: MixedProofInputs): MixedProofInputs {
  if (!input || !Array.isArray(input.buffers) || input.buffers.length > 256) throw new Error('input-cap');
  const controls = [input.selectionBytes, input.hydrationBytes, input.proofIndexBytes];
  let total = 0;
  for (const bytes of [...controls, ...input.buffers]) {
    if (!(bytes instanceof Uint8Array)
      || (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer)) throw new Error('input-type');
    total += bytes.byteLength;
    if (total > 64 * 1024 * 1024) throw new Error('input-cap');
  }
  if (controls.some(bytes => bytes.byteLength > SMALL_CAP)) throw new Error('input-cap');
  return {
    selectionBytes: snapshotInput(input.selectionBytes, SMALL_CAP),
    hydrationBytes: snapshotInput(input.hydrationBytes, SMALL_CAP),
    proofIndexBytes: snapshotInput(input.proofIndexBytes, SMALL_CAP),
    buffers: input.buffers.map(bytes => snapshotInput(bytes, 64 * 1024 * 1024)),
  };
}
