import { parseTree } from 'jsonc-parser';
import type { Node, ParseError } from 'jsonc-parser';
import { requireWireJson, freezeWireJson } from '../http/wire-json.ts';
import { SMALL_CAP, snapshotInput } from './protocol.ts';

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
/** Retains the original JSON member encoding after complete bounded closed-JSON parsing. */
export function boundedProofJsonField(bytes: Uint8Array, name: string, cap: number): Uint8Array<ArrayBuffer> {
  decodeBoundedProofJson(bytes, cap);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const tree = parseTree(text);
  const node = tree?.children?.find(property => property.children?.[0]?.value === name)?.children?.[1];
  if (tree?.type !== 'object' || !node) throw new Error('output');
  return new TextEncoder().encode(text.slice(node.offset, node.offset + node.length));
}
