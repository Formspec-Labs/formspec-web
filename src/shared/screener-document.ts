/**
 * Structural validation for `ScreenerDocumentInput` shapes consumed by the
 * ScreenerDocumentSource port (FW-0046).
 *
 * Mirrors the closed-set constraints of
 * `formspec/specs/screener/screener-spec.md` §2.1 + the upstream
 * `schemas/screener.schema.json`. Per web ADR-0004 §"consume primitives,"
 * formspec-web does NOT re-derive a full JSON Schema here — the canonical
 * schema lives upstream. This guard is the minimum structural check the
 * stub/conformance contract needs at the port boundary so a malformed
 * fixture fails fast at adapter registration rather than at WASM
 * evaluation time.
 */
import type { ScreenerDocumentInput } from '../ports/screener-document-source.ts';

export function isScreenerDocumentInput(value: unknown): value is ScreenerDocumentInput {
  if (!isObject(value)) return false;
  const doc = value as Record<string, unknown>;
  if (doc.$formspecScreener !== '1.0') return false;
  if (typeof doc.url !== 'string' || doc.url.length === 0) return false;
  if (typeof doc.version !== 'string' || doc.version.length === 0) return false;
  if (typeof doc.title !== 'string' || doc.title.length === 0) return false;
  if (!Array.isArray(doc.items)) return false;
  for (const item of doc.items) {
    if (!isObject(item)) return false;
    const rec = item as Record<string, unknown>;
    if (typeof rec.key !== 'string' || rec.key.length === 0) return false;
  }
  if (!Array.isArray(doc.evaluation)) return false;
  for (const phase of doc.evaluation) {
    if (!isObject(phase)) return false;
    const rec = phase as Record<string, unknown>;
    if (typeof rec.id !== 'string' || rec.id.length === 0) return false;
    if (typeof rec.strategy !== 'string' || rec.strategy.length === 0) return false;
    if (rec.routes !== undefined && !Array.isArray(rec.routes)) return false;
  }
  if (doc.binds !== undefined && !Array.isArray(doc.binds)) return false;
  if (
    doc.targetDefinition !== undefined
    && (!isObject(doc.targetDefinition)
      || ((doc.targetDefinition as Record<string, unknown>).url !== undefined
        && typeof (doc.targetDefinition as Record<string, unknown>).url !== 'string'))
  ) {
    return false;
  }
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
