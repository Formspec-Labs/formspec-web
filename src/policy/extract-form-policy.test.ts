import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import { extractAttachmentRequirement } from './extract-form-policy.ts';

const baseDefinition = {
  $formspec: '1.0',
  url: 'https://test.example/forms/x',
  version: '1.0.0',
  title: 'x',
  items: [],
} as const;

describe('extractAttachmentRequirement', () => {
  it('returns undefined when no attachment field is present', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
      ],
    };
    expect(extractAttachmentRequirement(definition)).toBeUndefined();
  });

  it('returns "required" when a top-level attachment field exists', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        { key: 'lease', type: 'field', dataType: 'attachment', label: 'Lease' },
      ],
    };
    expect(extractAttachmentRequirement(definition)).toBe('required');
  });

  it('returns "required" when an attachment field is nested inside a group', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [
        {
          key: 'household',
          type: 'group',
          label: 'Household',
          children: [
            { key: 'income', type: 'field', dataType: 'decimal', label: 'Income' },
            { key: 'paystub', type: 'field', dataType: 'attachment', label: 'Paystub' },
          ],
        },
      ],
    };
    expect(extractAttachmentRequirement(definition)).toBe('required');
  });

  it('returns "required" when an attachment field is nested in a repeating group', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [
        {
          key: 'dependents',
          type: 'group',
          label: 'Dependents',
          repeatable: true,
          children: [
            { key: 'birthCert', type: 'field', dataType: 'attachment', label: 'Birth certificate' },
          ],
        },
      ],
    };
    expect(extractAttachmentRequirement(definition)).toBe('required');
  });

  it('returns "required" once even when multiple attachment fields are present', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [
        { key: 'lease', type: 'field', dataType: 'attachment', label: 'Lease' },
        { key: 'idCard', type: 'field', dataType: 'attachment', label: 'ID' },
      ],
    };
    expect(extractAttachmentRequirement(definition)).toBe('required');
  });
});
