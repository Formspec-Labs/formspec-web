/** Source-owned static API. Composition supplies the qualified package; no implicit import. */
export interface SourceInitialMixedProofApi {
  initializeInitialMixedProof(input: { module_or_path: Uint8Array | WebAssembly.Module }): Promise<void>;
  verifyInitialMixedProof(selection: Uint8Array, hydration: Uint8Array, native: Uint8Array, image: Uint8Array): Uint8Array;
}
export interface ProofWorkerInputs {
  readonly selection: Uint8Array<ArrayBuffer>;
  readonly hydration: Uint8Array<ArrayBuffer>;
  readonly native: Uint8Array<ArrayBuffer>;
  readonly image: Uint8Array<ArrayBuffer>;
}
export type ProofWorkerCommand =
  | { readonly kind: 'initialize'; readonly id: number; readonly module: Uint8Array<ArrayBuffer> | WebAssembly.Module }
  | { readonly kind: 'verify'; readonly id: number; readonly inputs: ProofWorkerInputs };
export type ProofWorkerReply =
  | { readonly kind: 'ready'; readonly id: number }
  | { readonly kind: 'result'; readonly id: number; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'refused'; readonly id: number; readonly code: string };

/** Structural browser Worker subset permits deterministic lifecycle tests. */
export interface ProofWorker<Command = ProofWorkerCommand> {
  postMessage(message: Command, transfer: Transferable[]): void;
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: unknown) => void): void;
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: unknown) => void): void;
  terminate(): void;
}
export const SMALL_CAP = 2 * 1024 * 1024;
export const IMAGE_CAP = 48 * 1024 * 1024;
export const SOURCE_REFUSALS = new Set([
  'input-cap', 'input-json', 'schema', 'input-wire', 'unsupported-scope', 'binding', 'clock',
  'receipt', 'native-proof', 'image-proof', 'mixed-proof', 'unsupported-number', 'output', 'output-cap',
  'init-input', 'already-initialized', 'init-export', 'init-failed', 'not-initialized', 'input-type', 'verification-failed',
]);
export function sourceFailureCode(error: unknown): string {
  return error instanceof Error && SOURCE_REFUSALS.has(error.message) ? error.message : 'verification-failed';
}
export function snapshotInput(value: Uint8Array, cap: number): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)
    || (typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer)) throw new Error('input-type');
  if (value.byteLength > cap) throw new Error('input-cap');
  return Uint8Array.from(value);
}
