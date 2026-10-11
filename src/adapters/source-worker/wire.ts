import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseTree } from 'jsonc-parser';
import type { Node, ParseError } from 'jsonc-parser';
import schema from '../http/source-schemas/initial-mixed-browser-v1.schema.json';
import type { EvaluationProviderRegistration } from '../../ports/evaluation-hydration.ts';
import type { InitialMixedHydrationWire, InitialNativeRequest } from '../../ports/initial-mixed-proof.ts';
import { requireWireJson, freezeWireJson } from '../http/wire-json.ts';
import { SMALL_CAP, snapshotInput } from './protocol.ts';

export interface InitialProofSelection {
  readonly version: 1;
  readonly registration: EvaluationProviderRegistration;
  readonly request: InitialNativeRequest;
  readonly currentAt: string;
}
export interface InitialProofOutcome {
  readonly version: 1;
  readonly kind: 'verifiedInitialMixed';
  readonly requestHash: string;
  readonly registrationHash: string;
  readonly receiptHash: string;
  readonly qualifiedAt: string;
  readonly expiresAt: string;
  readonly results: InitialMixedHydrationWire['results'];
}
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(schema);
const selectionSchema = ajv.compile<InitialProofSelection>({ $ref: `${schema.$id}#/$defs/Selection` });
const outcomeSchema = ajv.compile<InitialProofOutcome>({ $ref: `${schema.$id}#/$defs/Outcome` });

export function selectionBytes(value: InitialProofSelection): Uint8Array<ArrayBuffer> {
  requireWireJson(value);
  if (!selectionSchema(value)) throw new Error('schema');
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > SMALL_CAP) throw new Error('input-cap');
  return bytes;
}
/** Admission of owning emitted output only; this does not recompute any proof algorithm. */
export function decodeBoundedProofJson(bytes: Uint8Array, cap = SMALL_CAP): unknown {
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 4 * 1024 * 1024 + 4096) throw new Error('input-cap');
  const copy = snapshotInput(bytes, cap);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(copy);
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (!tree || errors.length) throw new Error('output');
  const inspect = (node: Node, depth: number) => {
    if (depth > 256) throw new Error('output');
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value as string;
        if (keys.has(key)) throw new Error('output');
        keys.add(key);
      }
    }
    if (node.type === 'number' && (!Number.isFinite(node.value) || Math.abs(node.value as number) > Number.MAX_SAFE_INTEGER)) {
      throw new Error('unsupported-number');
    }
    for (const child of node.children ?? []) inspect(child, depth + 1);
  };
  inspect(tree, 0);
  const value: unknown = JSON.parse(text);
  requireWireJson(value);
  freezeWireJson(value);
  return value;
}
export function decodeInitialProofOutcome(bytes: Uint8Array): InitialProofOutcome {
  const value = decodeBoundedProofJson(bytes);
  if (!outcomeSchema(value)) throw new Error('output');
  return value;
}

/** Retains the original JSON member encoding after complete bounded closed-JSON parsing. */
export function boundedProofJsonField(bytes: Uint8Array, name: string, cap: number): Uint8Array<ArrayBuffer> {
  decodeBoundedProofJson(bytes, cap);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const tree = parseTree(text);
  const node = tree?.children?.find(property => property.children?.[0]?.value === name)?.children?.[1];
  if (tree?.type !== 'object' || !node) throw new Error('output');
  return new TextEncoder().encode(text.slice(node.offset, node.offset + node.length));
}
