import type { FormDefinition } from '@formspec-org/types';
import {
  AttachmentRequirementExtractor,
  CompositeFormRuntimePolicyExtractor,
  EmptyFormRuntimePolicyExtractor,
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
