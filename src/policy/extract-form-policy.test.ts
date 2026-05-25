import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import {
  extractAttachmentRequirement,
  extractOfflineSubmitOptIn,
} from './extract-form-policy.ts';

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

describe('extractOfflineSubmitOptIn', () => {
  const offlineBase: FormDefinition = {
    ...baseDefinition,
    items: [],
  };

  it('returns undefined when the offline extension is absent', () => {
    expect(extractOfflineSubmitOptIn(offlineBase)).toBeUndefined();
  });

  it('returns "optional" when extensions["x-formspec-offline-submit"] is true', () => {
    const definition: FormDefinition = {
      ...offlineBase,
      extensions: { 'x-formspec-offline-submit': true },
    };
    expect(extractOfflineSubmitOptIn(definition)).toBe('optional');
  });

  it('returns undefined when extensions["x-formspec-offline-submit"] is false', () => {
    const definition: FormDefinition = {
      ...offlineBase,
      extensions: { 'x-formspec-offline-submit': false },
    };
    expect(extractOfflineSubmitOptIn(definition)).toBeUndefined();
  });

  it('returns undefined for a non-boolean string value', () => {
    const definition: FormDefinition = {
      ...offlineBase,
      extensions: { 'x-formspec-offline-submit': 'yes' as unknown as boolean },
    };
    expect(extractOfflineSubmitOptIn(definition)).toBeUndefined();
  });

  it('returns undefined for an object truthy value', () => {
    const definition: FormDefinition = {
      ...offlineBase,
      extensions: { 'x-formspec-offline-submit': { enabled: true } as unknown as boolean },
    };
    expect(extractOfflineSubmitOptIn(definition)).toBeUndefined();
  });

  it('returns undefined for the numeric 1 (strict equality, not truthy)', () => {
    // Pins the `=== true` contract: numeric coercion does NOT opt in.
    const definition: FormDefinition = {
      ...offlineBase,
      extensions: { 'x-formspec-offline-submit': 1 as unknown as boolean },
    };
    expect(extractOfflineSubmitOptIn(definition)).toBeUndefined();
  });

  it('returns undefined for the string "true" (strict equality, not coerced)', () => {
    // Pins the `=== true` contract: the literal string "true" is not boolean
    // true and MUST NOT opt in.
    const definition: FormDefinition = {
      ...offlineBase,
      extensions: { 'x-formspec-offline-submit': 'true' as unknown as boolean },
    };
    expect(extractOfflineSubmitOptIn(definition)).toBeUndefined();
  });
});
