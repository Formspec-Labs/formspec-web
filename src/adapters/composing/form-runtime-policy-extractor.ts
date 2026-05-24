/**
 * Composing reference adapters for the `FormRuntimePolicyExtractor` port
 * (FW-0066). These are not "stub" adapters — they are the substrate primitives
 * production compositions wire on real definitions, and the convention every
 * future feature ADR follows for adding a definition-introspective extractor.
 *
 * - `EmptyFormRuntimePolicyExtractor` — narrowed-route compositions wire this
 *   into the slot so the type contract is satisfied; non-form surfaces
 *   synthesize their request literally per ADR-0011 §"Non-form surface
 *   synthesis" addendum and never reach the extractor.
 * - `AttachmentRequirementExtractor` — wraps the FW-0033 attachment-field
 *   walker; declares `fileUpload: 'required'` when any attachment field is
 *   present in the definition, else returns no requirement.
 * - `CompositeFormRuntimePolicyExtractor` — composes an ordered
 *   `FormRuntimePolicyExtractor[]` into one, merging per-key. Later entries
 *   in the array override earlier entries on a key collision (call-site
 *   ordering is the precedence signal).
 */
import { extractAttachmentRequirement } from '../../policy/extract-form-policy.ts';
import type { FormRuntimePolicy } from '../../policy/policy-shapes.ts';
import type { FormRuntimePolicyExtractor } from '../../ports/form-runtime-policy-extractor.ts';
import type { FormDefinition } from '../../ports/definition-source.ts';

export class EmptyFormRuntimePolicyExtractor implements FormRuntimePolicyExtractor {
  extract(_definition: FormDefinition): FormRuntimePolicy {
    return { features: {} };
  }
}

export class AttachmentRequirementExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    const fileUpload = extractAttachmentRequirement(definition);
    return fileUpload ? { features: { fileUpload } } : { features: {} };
  }
}

export class CompositeFormRuntimePolicyExtractor implements FormRuntimePolicyExtractor {
  constructor(private readonly extractors: readonly FormRuntimePolicyExtractor[]) {}

  extract(definition: FormDefinition): FormRuntimePolicy {
    const features: FormRuntimePolicy['features'] = {};
    for (const extractor of this.extractors) {
      const policy = extractor.extract(definition);
      Object.assign(features, policy.features);
    }
    return { features };
  }
}
