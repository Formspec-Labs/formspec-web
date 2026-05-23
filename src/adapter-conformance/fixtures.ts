import type { FormDefinition, FormResponse, IntakeHandoff } from '@formspec-org/types';
import type { NotificationMessage } from '../ports/notification-delivery.ts';

export const sampleFormDefinition: FormDefinition = {
  $formspec: '1.0',
  url: 'https://formspec.example.test/forms/conformance',
  version: '1.0.0',
  title: 'Conformance Test Form',
  items: [
    {
      key: 'fullName',
      type: 'field',
      label: 'Full name',
      dataType: 'string',
    },
  ],
};

export const sampleFormResponse: FormResponse = {
  $formspecResponse: '1.0',
  definitionUrl: sampleFormDefinition.url,
  definitionVersion: sampleFormDefinition.version,
  status: 'completed',
  data: {
    fullName: 'Ada Lovelace',
  },
  authored: '2026-05-22T00:00:00.000Z',
};

export const sampleIntakeHandoff: IntakeHandoff = {
  $formspecIntakeHandoff: '1.0',
  handoffId: 'handoff-conformance-1',
  initiationMode: 'publicIntake',
  definitionRef: {
    url: sampleFormDefinition.url,
    version: sampleFormDefinition.version,
  },
  responseRef: 'response:conformance:1',
  responseHash: 'sha256:conformance-response',
  validationReportRef: 'validation:conformance:1',
  intakeSessionId: 'intake-session-conformance-1',
  ledgerHeadRef: 'ledger:conformance:head',
  occurredAt: '2026-05-22T00:00:00.000Z',
};

export const sampleNotificationMessage: NotificationMessage = {
  channel: 'email',
  to: 'respondent@example.test',
  subject: 'Conformance message',
  body: 'This message exercises NotificationDelivery conformance.',
};

export function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
