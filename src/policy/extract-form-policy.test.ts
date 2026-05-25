import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import {
  extractAttachmentRequirement,
  extractEmbeddableOptIn,
  extractMultiPartyPolicy,
  extractOfflineSubmitOptIn,
  extractPaymentAmount,
  extractPaymentRequirement,
  extractRecordLifecycleOptIn,
  extractRecordLifecyclePolicy,
  extractSafeAddressPolicy,
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

describe('extractPaymentRequirement', () => {
  const paymentBase: FormDefinition = {
    ...baseDefinition,
    items: [],
  };

  it('returns undefined when the payment extension is absent', () => {
    expect(extractPaymentRequirement(paymentBase)).toBeUndefined();
  });

  it('returns "required" when extensions["x-formspec-payment-required"] is true', () => {
    const definition: FormDefinition = {
      ...paymentBase,
      extensions: { 'x-formspec-payment-required': true },
    };
    expect(extractPaymentRequirement(definition)).toBe('required');
  });

  it('returns undefined when extensions["x-formspec-payment-required"] is false', () => {
    const definition: FormDefinition = {
      ...paymentBase,
      extensions: { 'x-formspec-payment-required': false },
    };
    expect(extractPaymentRequirement(definition)).toBeUndefined();
  });

  it('returns undefined for non-boolean values (strict equality)', () => {
    const stringValue: FormDefinition = {
      ...paymentBase,
      extensions: { 'x-formspec-payment-required': 'yes' as unknown as boolean },
    };
    expect(extractPaymentRequirement(stringValue)).toBeUndefined();
    const numericValue: FormDefinition = {
      ...paymentBase,
      extensions: { 'x-formspec-payment-required': 1 as unknown as boolean },
    };
    expect(extractPaymentRequirement(numericValue)).toBeUndefined();
  });
});

describe('extractMultiPartyPolicy', () => {
  it('returns required multiParty policy from the provisional extension carrier', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [],
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

    expect(extractMultiPartyPolicy(definition)).toMatchObject({
      features: { multiParty: 'required' },
      limits: {
        multiParty: {
          tier: 'coEqual',
          invitationChannel: 'magic-link',
          parties: [
            { roleId: 'spouse-a', role: 'coEqual' },
            { roleId: 'spouse-b', role: 'coEqual' },
          ],
        },
      },
    });
  });

  it('declines malformed multiParty carriers before resolver validation', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      items: [],
      extensions: {
        'x-formspec-multi-party': {
          tier: 'coEqual',
          parties: [{ roleId: 'only-one', role: 'coEqual' }],
        },
      },
    };
    expect(extractMultiPartyPolicy(definition)).toBeUndefined();
  });
});

describe('extractPaymentAmount', () => {
  const paymentBase: FormDefinition = {
    ...baseDefinition,
    items: [],
  };

  it('returns undefined when the amount extension is absent', () => {
    expect(extractPaymentAmount(paymentBase)).toBeUndefined();
  });

  it('returns well-formed Money when the extension is well-shaped', () => {
    const definition: FormDefinition = {
      ...paymentBase,
      extensions: {
        'x-formspec-payment-amount': { amountMinorUnits: 1500, currency: 'USD' },
      },
    };
    expect(extractPaymentAmount(definition)).toEqual({
      amountMinorUnits: 1500,
      currency: 'USD',
    });
  });

  it('returns undefined for fractional minor units', () => {
    const definition: FormDefinition = {
      ...paymentBase,
      extensions: {
        'x-formspec-payment-amount': { amountMinorUnits: 12.5, currency: 'USD' },
      },
    };
    expect(extractPaymentAmount(definition)).toBeUndefined();
  });

  it('returns undefined for negative amount', () => {
    const definition: FormDefinition = {
      ...paymentBase,
      extensions: {
        'x-formspec-payment-amount': { amountMinorUnits: -100, currency: 'USD' },
      },
    };
    expect(extractPaymentAmount(definition)).toBeUndefined();
  });

  it('returns undefined for empty currency', () => {
    const definition: FormDefinition = {
      ...paymentBase,
      extensions: {
        'x-formspec-payment-amount': { amountMinorUnits: 100, currency: '' },
      },
    };
    expect(extractPaymentAmount(definition)).toBeUndefined();
  });

  it('returns undefined for missing fields', () => {
    const noCurrency: FormDefinition = {
      ...paymentBase,
      extensions: {
        'x-formspec-payment-amount': { amountMinorUnits: 100 } as unknown as Record<string, unknown>,
      },
    };
    expect(extractPaymentAmount(noCurrency)).toBeUndefined();
    const noAmount: FormDefinition = {
      ...paymentBase,
      extensions: {
        'x-formspec-payment-amount': { currency: 'USD' } as unknown as Record<string, unknown>,
      },
    };
    expect(extractPaymentAmount(noAmount)).toBeUndefined();
  });
});

describe("extractEmbeddableOptIn", () => {
  const embedBase: FormDefinition = {
    ...baseDefinition,
    items: [],
  };

  it("returns undefined when the embeddable extension is absent", () => {
    expect(extractEmbeddableOptIn(embedBase)).toBeUndefined();
  });

  it("returns optional when the embeddable extension is true", () => {
    const definition: FormDefinition = {
      ...embedBase,
      extensions: { "x-formspec-embeddable": true },
    };
    expect(extractEmbeddableOptIn(definition)).toBe("optional");
  });

  it("returns undefined when the embeddable extension is false", () => {
    const definition: FormDefinition = {
      ...embedBase,
      extensions: { "x-formspec-embeddable": false },
    };
    expect(extractEmbeddableOptIn(definition)).toBeUndefined();
  });

  it("ignores non-boolean truthy values", () => {
    const stringValue: FormDefinition = {
      ...embedBase,
      extensions: { "x-formspec-embeddable": "yes" as unknown as boolean },
    };
    expect(extractEmbeddableOptIn(stringValue)).toBeUndefined();
    const numericValue: FormDefinition = {
      ...embedBase,
      extensions: { "x-formspec-embeddable": 1 as unknown as boolean },
    };
    expect(extractEmbeddableOptIn(numericValue)).toBeUndefined();
  });
});

describe('extractRecordLifecycleOptIn', () => {
  const lifecycleBase: FormDefinition = {
    ...baseDefinition,
    items: [],
  };

  it('returns undefined when no record lifecycle proposal block is present', () => {
    expect(extractRecordLifecycleOptIn(lifecycleBase)).toBeUndefined();
  });

  it('returns optional when the extension proposal enables an action', () => {
    const definition: FormDefinition = {
      ...lifecycleBase,
      extensions: {
        'x-formspec-record-lifecycle': {
          correctable: { enabled: true, correctableFieldSet: ['/householdSize'] },
        },
      },
    };
    expect(extractRecordLifecycleOptIn(definition)).toBe('optional');
    expect(extractRecordLifecyclePolicy(definition)?.correctable?.correctableFieldSet).toEqual([
      '/householdSize',
    ]);
  });

  it('returns optional when the EXT-35 governance proposal enables an action', () => {
    const definition = {
      ...lifecycleBase,
      governance: {
        recordLifecycle: {
          withdrawable: { enabled: true },
        },
      },
    } as FormDefinition;
    expect(extractRecordLifecycleOptIn(definition)).toBe('optional');
    expect(extractRecordLifecyclePolicy(definition)?.withdrawable?.enabled).toBe(true);
  });

  it('extracts per-act lifecycle policy controls from the governance proposal', () => {
    const definition = {
      ...lifecycleBase,
      governance: {
        recordLifecycle: {
          correctable: {
            enabled: true,
            correctableFieldSet: ['/householdSize'],
            window: { state: 'closed', closedAt: '2026-06-01T00:00:00.000Z' },
            requiresEvidence: true,
            requiresReason: false,
          },
          withdrawable: {
            enabled: true,
            requiresReason: false,
            partyScope: 'all-parties-must-agree',
          },
          disputable: {
            enabled: true,
            signerOnly: true,
            requiresReason: true,
          },
        },
      },
    } as FormDefinition;
    const policy = extractRecordLifecyclePolicy(definition);
    expect(policy?.correctable?.window).toEqual({
      state: 'closed',
      closedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(policy?.correctable?.requiresEvidence).toBe(true);
    expect(policy?.correctable?.requiresReason).toBe(false);
    expect(policy?.withdrawable?.partyScope).toBe('all-parties-must-agree');
    expect(policy?.disputable?.signerOnly).toBe(true);
  });

  it('ignores disabled and malformed proposal blocks', () => {
    const disabled: FormDefinition = {
      ...lifecycleBase,
      extensions: {
        'x-formspec-record-lifecycle': {
          correctable: { enabled: false },
          withdrawable: { enabled: false },
          disputable: { enabled: false },
        },
      },
    };
    expect(extractRecordLifecycleOptIn(disabled)).toBeUndefined();

    const malformed: FormDefinition = {
      ...lifecycleBase,
      extensions: { 'x-formspec-record-lifecycle': 'yes' },
    };
    expect(extractRecordLifecycleOptIn(malformed)).toBeUndefined();
  });
});

describe('extractSafeAddressPolicy', () => {
  it('returns undefined when no safe-address carrier or safe-* field is present', () => {
    expect(extractSafeAddressPolicy({ ...baseDefinition, items: [] })).toBeUndefined();
  });

  it('extracts safe-* item classes into a required safeAddress policy', () => {
    const definition = {
      ...baseDefinition,
      items: [
        {
          key: 'protectedHomeAddress',
          type: 'field',
          dataType: 'string',
          label: 'Protected home address',
          accessControl: {
            class: 'safe-address',
            plaintextAudiences: ['issuer_verification'],
          },
          visibleTo: ['issuer_verification'],
        },
      ],
      extensions: {
        'x-formspec-safe-address': {
          acpJurisdictionsAccepted: ['CA-ACP'],
        },
      },
    } as FormDefinition;
    const policy = extractSafeAddressPolicy(definition);
    expect(policy?.features.safeAddress).toBe('required');
    expect(policy?.limits?.safeAddress).toMatchObject({
      acpJurisdictionsAccepted: ['CA-ACP'],
      fields: [
        {
          path: '/protectedHomeAddress',
          accessClass: 'safe-address',
          visibleTo: ['issuer_verification'],
          plaintextAudiences: ['issuer_verification'],
        },
      ],
    });
  });

  it('upgrades explicit safe-address field carriers to required mode', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      extensions: {
        'x-formspec-safe-address': {
          mode: 'optional',
          receiptPostureTier: 'phase-1-fallback',
          acpJurisdictionsAccepted: ['WA-ACP'],
          fields: [
            {
              path: '/safeContact',
              accessClass: 'safe-contact',
              effectiveAudiences: ['issuer_verification'],
            },
          ],
        },
      },
      items: [],
    };
    const policy = extractSafeAddressPolicy(definition);
    expect(policy?.features.safeAddress).toBe('required');
    expect(policy?.limits?.safeAddress).toMatchObject({
      enabledClasses: ['safe-contact'],
      acpJurisdictionsAccepted: ['WA-ACP'],
    });
  });

  it('treats false as an explicit form-level forbid', () => {
    const definition: FormDefinition = {
      ...baseDefinition,
      extensions: { 'x-formspec-safe-address': false },
      items: [],
    };
    expect(extractSafeAddressPolicy(definition)?.features.safeAddress).toBe('forbidden');
  });

  it('does not let an explicit false extension disable discovered safe-* fields', () => {
    const definition = {
      ...baseDefinition,
      items: [
        {
          key: 'protectedHomeAddress',
          type: 'field',
          dataType: 'string',
          label: 'Protected home address',
          accessControl: { class: 'safe-address' },
        },
      ],
      extensions: { 'x-formspec-safe-address': false },
    } as FormDefinition;
    const policy = extractSafeAddressPolicy(definition);
    expect(policy?.features.safeAddress).toBe('required');
    expect(policy?.limits?.safeAddress).toMatchObject({
      fields: [{ path: '/protectedHomeAddress', accessClass: 'safe-address' }],
    });
  });
});
