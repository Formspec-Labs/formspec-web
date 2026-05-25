import type { FormDefinition } from '@formspec-org/types';
import {
  AttachmentRequirementExtractor,
  CompositeFormRuntimePolicyExtractor,
  EmbeddableExtractor,
  EmptyFormRuntimePolicyExtractor,
  MultiPartyPolicyExtractor,
  OfflineSubmitRequirementExtractor,
  PaymentRequirementExtractor,
  RecordLifecycleExtractor,
  SafeAddressPolicyExtractor,
  TrustedReviewerPolicyExtractor,
} from '../../../src/adapters/composing/form-runtime-policy-extractor.ts';
import {
  DemoFormPolicyExtractor,
  stubFormRuntimePolicyExtractor,
} from '../../../src/adapters/stub/form-runtime-policy-extractor.ts';
import { demoSampleFormUrl } from '../../../src/demo/index.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';
import { defineFormRuntimePolicyExtractorConformance } from '../_framework/conformance.ts';

const attachmentBearingDefinition: FormDefinition = {
  ...sampleFormDefinition,
  items: [
    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    { key: 'paystub', type: 'field', dataType: 'attachment', label: 'Paystub' },
  ],
};

const demoFormDefinition: FormDefinition = {
  ...sampleFormDefinition,
  url: demoSampleFormUrl,
};

defineFormRuntimePolicyExtractorConformance(
  'EmptyFormRuntimePolicyExtractor conformance',
  () => ({ adapter: new EmptyFormRuntimePolicyExtractor() }),
);

defineFormRuntimePolicyExtractorConformance(
  'AttachmentRequirementExtractor conformance (attachment-bearing definition)',
  () => ({
    adapter: new AttachmentRequirementExtractor(),
    definition: attachmentBearingDefinition,
  }),
);

defineFormRuntimePolicyExtractorConformance(
  'DemoFormPolicyExtractor conformance (demo form URL)',
  () => ({
    adapter: new DemoFormPolicyExtractor(),
    definition: demoFormDefinition,
  }),
);

defineFormRuntimePolicyExtractorConformance(
  'stubFormRuntimePolicyExtractor (marked) conformance (demo form URL)',
  () => ({
    adapter: stubFormRuntimePolicyExtractor(),
    definition: demoFormDefinition,
  }),
);

defineFormRuntimePolicyExtractorConformance(
  'CompositeFormRuntimePolicyExtractor conformance (demo + attachment)',
  () => ({
    adapter: new CompositeFormRuntimePolicyExtractor([
      new DemoFormPolicyExtractor(),
      new AttachmentRequirementExtractor(),
    ]),
    definition: { ...attachmentBearingDefinition, url: demoSampleFormUrl },
  }),
);

const offlineOptInDefinition: FormDefinition = {
  ...sampleFormDefinition,
  extensions: { 'x-formspec-offline-submit': true },
};

defineFormRuntimePolicyExtractorConformance(
  'OfflineSubmitRequirementExtractor conformance (offline-opt-in definition)',
  () => ({
    adapter: new OfflineSubmitRequirementExtractor(),
    definition: offlineOptInDefinition,
  }),
);

const paymentRequiredDefinition: FormDefinition = {
  ...sampleFormDefinition,
  extensions: {
    'x-formspec-payment-required': true,
    'x-formspec-payment-amount': { amountMinorUnits: 1500, currency: 'USD' },
  },
};

defineFormRuntimePolicyExtractorConformance(
  'PaymentRequirementExtractor conformance (payment-required definition)',
  () => ({
    adapter: new PaymentRequirementExtractor(),
    definition: paymentRequiredDefinition,
  }),
);

const embeddableDefinition: FormDefinition = {
  ...sampleFormDefinition,
  extensions: { 'x-formspec-embeddable': true },
};

defineFormRuntimePolicyExtractorConformance(
  'EmbeddableExtractor conformance (embeddable definition)',
  () => ({
    adapter: new EmbeddableExtractor(),
    definition: embeddableDefinition,
  }),
);

const trustedReviewerDefinition: FormDefinition = {
  ...sampleFormDefinition,
  extensions: {
    'x-formspec-trusted-reviewer': {
      posture: 'suggest-allowed',
      respondentOnlyFieldPointers: ['/data/protectedAddress'],
    },
  },
};

defineFormRuntimePolicyExtractorConformance(
  'TrustedReviewerPolicyExtractor conformance (trusted-reviewer definition)',
  () => ({
    adapter: new TrustedReviewerPolicyExtractor(),
    definition: trustedReviewerDefinition,
  }),
);

const recordLifecycleDefinition: FormDefinition = {
  ...sampleFormDefinition,
  extensions: {
    'x-formspec-record-lifecycle': {
      correctable: { enabled: true, correctableFieldSet: ['/householdSize'] },
    },
  },
};

defineFormRuntimePolicyExtractorConformance(
  'RecordLifecycleExtractor conformance (record-lifecycle definition)',
  () => ({
    adapter: new RecordLifecycleExtractor(),
    definition: recordLifecycleDefinition,
  }),
);

const multiPartyDefinition: FormDefinition = {
  ...sampleFormDefinition,
  extensions: {
    'x-formspec-multi-party': {
      tier: 'coEqual',
      invitationChannel: 'magic-link',
      parties: [
        {
          roleId: 'spouse-a',
          label: 'Spouse A',
          role: 'coEqual',
          cardinality: { min: 1, max: 1 },
          visibilityScope: 'shared',
        },
        {
          roleId: 'spouse-b',
          label: 'Spouse B',
          role: 'coEqual',
          cardinality: { min: 1, max: 1 },
          visibilityScope: 'shared',
        },
      ],
    },
  },
};

defineFormRuntimePolicyExtractorConformance(
  'MultiPartyPolicyExtractor conformance (multi-party definition)',
  () => ({
    adapter: new MultiPartyPolicyExtractor(),
    definition: multiPartyDefinition,
  }),
);

const safeAddressDefinition: FormDefinition = {
  ...sampleFormDefinition,
  items: [
    {
      key: 'protectedHomeAddress',
      type: 'field',
      dataType: 'string',
      label: 'Protected home address',
      accessControl: { class: 'safe-address' },
    },
  ],
  extensions: {
    'x-formspec-safe-address': {
      acpJurisdictionsAccepted: ['CA-ACP'],
      authorizedAudiences: ['issuer_verification'],
    },
  },
};

defineFormRuntimePolicyExtractorConformance(
  'SafeAddressPolicyExtractor conformance (safe-address definition)',
  () => ({
    adapter: new SafeAddressPolicyExtractor(),
    definition: safeAddressDefinition,
  }),
);
