/**
 * Demo screener catalog (FW-0046 slice 1, J-047).
 *
 * Three plain-language questions route the respondent to one of three
 * sample form definitions. The shape exercises every renderer branch:
 * a `choice` field, a `boolean` field, and a `money` field; first-match
 * routing across four routes (one external, three internal); a non-null
 * `targetDefinition` for the "default new application" route.
 *
 * The bundled demo composition wires the screener under
 * `urn:demo:formspec-web:screener:benefits-or-grant`. Tests load it via
 * the same URN to keep the fixture pin in one place.
 */
import type { ScreenerDocumentInput } from '../ports/screener-document-source.ts';

export const demoScreenerUrl = 'urn:demo:formspec-web:screener:benefits-or-grant';

export const demoScreener: ScreenerDocumentInput = {
  $formspecScreener: '1.0',
  url: demoScreenerUrl,
  version: '1.0.0',
  title: 'Which form is right for you?',
  description:
    'Answer three short questions. We will send you to the form that fits — no jargon, no skipped sections.',
  submitLabel: 'Find my form',
  targetDefinition: {
    url: 'urn:demo:formspec-web:form:benefits-intake',
  },
  items: [
    {
      key: 'household_type',
      type: 'field',
      dataType: 'choice',
      label: 'Who are you applying for?',
      hint: 'Pick the option that matches your situation today.',
      options: [
        { value: 'self', label: 'Just myself' },
        { value: 'family', label: 'My family (myself and others I support)' },
        { value: 'organization', label: 'An organization or business' },
      ],
    },
    {
      key: 'has_income',
      type: 'field',
      dataType: 'boolean',
      label: 'Do you currently have income from a job or benefits?',
    },
    {
      key: 'amount_needed',
      type: 'field',
      dataType: 'money',
      label: 'About how much help do you need?',
      hint: 'A best guess is fine. You can change this later.',
      currency: 'USD',
    } as ScreenerDocumentInput['items'][number] & { currency: string },
  ],
  binds: [
    { path: 'household_type', required: 'true' },
    { path: 'has_income', required: 'true' },
  ],
  evaluation: [
    {
      id: 'routing',
      strategy: 'first-match',
      routes: [
        {
          condition: "$household_type = 'organization'",
          target: 'urn:demo:formspec-web:form:grant-application',
          label: 'Organization grant application',
          message: 'You need the grant application — it asks about your organization, not your household.',
        },
        {
          condition: "$household_type = 'family' and $has_income = false",
          target: 'urn:demo:formspec-web:form:family-benefits',
          label: 'Family benefits application',
          message:
            'You qualify for the family benefits track. Fewer questions about your job history; more about your household.',
        },
        {
          condition: "$has_income = true",
          target: 'urn:demo:formspec-web:form:benefits-intake',
          label: 'Standard benefits intake',
          message:
            'You can use the standard intake. You will fill in your income details on the next page.',
        },
        {
          condition: 'true',
          target: 'urn:demo:formspec-web:form:benefits-intake',
          label: 'Standard benefits intake',
          message:
            'You can use the standard intake. You will skip the income questions; we will only ask what we need.',
        },
      ],
    },
  ],
};

export function demoScreenerCatalog(): ReadonlyArray<ScreenerDocumentInput> {
  return [demoScreener];
}
