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
import {
  extractAttachmentRequirement,
  extractEmbeddableOptIn,
  extractOfflineSubmitOptIn,
  extractPaymentRequirement,
  extractRecordLifecycleOptIn,
  extractRecordLifecyclePolicy,
  extractTrustedReviewerPolicy,
} from '../../policy/extract-form-policy.ts';
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

export class OfflineSubmitRequirementExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    const offlineSubmit = extractOfflineSubmitOptIn(definition);
    return offlineSubmit ? { features: { offlineSubmit } } : { features: {} };
  }
}

export class PaymentRequirementExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    const payment = extractPaymentRequirement(definition);
    return payment ? { features: { payment } } : { features: {} };
  }
}

export class EmbeddableExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    const embed = extractEmbeddableOptIn(definition);
    return embed ? { features: { embed } } : { features: {} };
  }
}

export class TrustedReviewerPolicyExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    return extractTrustedReviewerPolicy(definition) ?? { features: {} };
  }
}

export class RecordLifecycleExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    const recordLifecycle = extractRecordLifecycleOptIn(definition);
    const policy = extractRecordLifecyclePolicy(definition);
    return recordLifecycle
      ? { features: { recordLifecycle }, recordLifecycle: policy }
      : { features: {} };
  }
}

export class CompositeFormRuntimePolicyExtractor implements FormRuntimePolicyExtractor {
  constructor(private readonly extractors: readonly FormRuntimePolicyExtractor[]) {}

  extract(definition: FormDefinition): FormRuntimePolicy {
    const features: FormRuntimePolicy['features'] = {};
    const limits: NonNullable<FormRuntimePolicy['limits']> = {};
    const recordLifecycle: NonNullable<FormRuntimePolicy['recordLifecycle']> = {};
    for (const extractor of this.extractors) {
      const policy = extractor.extract(definition);
      Object.assign(features, policy.features);
      Object.assign(limits, policy.limits);
      Object.assign(recordLifecycle, policy.recordLifecycle);
    }
    const output: { features: FormRuntimePolicy['features']; limits?: FormRuntimePolicy['limits']; recordLifecycle?: FormRuntimePolicy['recordLifecycle'] } = { features };
    if (Object.keys(limits).length > 0) {
      output.limits = limits;
    }
    if (Object.keys(recordLifecycle).length > 0) {
      output.recordLifecycle = recordLifecycle;
    }
    return output;
  }
}
