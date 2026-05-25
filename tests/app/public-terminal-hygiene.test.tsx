import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FormDefinition } from '@formspec-org/types';
import {
  ConfirmationPanel,
  RespondentRuntime,
} from '../../src/app/RespondentRuntime.tsx';
import {
  PUBLIC_TERMINAL_CLEARED_TITLE,
  PUBLIC_TERMINAL_SMS_INVALID_COPY,
  PUBLIC_TERMINAL_SMS_SENT_COPY,
  publicTerminalDraftKeysToClear,
} from '../../src/app/public-terminal-hygiene.ts';
import type { ResolvedMultiPartyPolicy } from '../../src/policy/index.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubEmbedTransport } from '../../src/adapters/stub/embed-transport.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../../src/adapters/stub/payment-rail-adapter.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubScreenerDocumentSource } from '../../src/adapters/stub/screener-document-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { unavailablePreallocatedFeaturePorts } from '../../src/adapters/unavailable/preallocated-feature-port.ts';
import type { Composition } from '../../src/composition/types.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import type { InstanceCapabilities, OrgRuntimePolicy } from '../../src/policy/index.ts';

const confirmation = {
  referenceNumber: 'TEST-000123',
  status: 'accepted' as const,
  caseUrn: 'urn:wos:case_test_000123',
};

describe('public-terminal confirmation actions (FW-0041)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('prints the confirmation and shows a short verifier code', () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true });

    const { container } = render(<ConfirmationPanel confirmation={confirmation} />);

    expect(screen.getByText('000123')).not.toBeNull();
    expect(container.querySelector('.public-terminal-actions__print-url')?.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Print confirmation' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('sends an SMS receipt through NotificationDelivery', async () => {
    const notifications = stubNotificationDelivery({ capabilities: { sms: 'real' } });
    render(
      <ConfirmationPanel
        confirmation={confirmation}
        notificationDelivery={notifications}
      />,
    );

    fireEvent.change(screen.getByLabelText('Text receipt to SMS'), {
      target: { value: '(312) 555-0101' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text receipt' }));

    await waitFor(() => {
      expect(screen.getByText(PUBLIC_TERMINAL_SMS_SENT_COPY)).not.toBeNull();
    });
    expect(notifications.sent).toHaveLength(1);
    expect(notifications.sent[0]?.message).toMatchObject({
      channel: 'sms',
      to: '3125550101',
    });
    expect(notifications.sent[0]?.message.body).toContain('Reference TEST-000123');
    expect(notifications.sent[0]?.message.body).toContain('Verifier code 000123');
    expect(notifications.sent[0]?.message.body).not.toContain('urn:');
    expect(notifications.sent[0]?.message.body).not.toContain('urn%3A');
    expect(notifications.sent[0]?.message.body).not.toContain('wos');
  });

  it('validates the SMS destination before calling the delivery port', async () => {
    const notifications = stubNotificationDelivery({ capabilities: { sms: 'real' } });
    render(
      <ConfirmationPanel
        confirmation={confirmation}
        notificationDelivery={notifications}
      />,
    );

    fireEvent.change(screen.getByLabelText('Text receipt to SMS'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text receipt' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(PUBLIC_TERMINAL_SMS_INVALID_COPY);
    });
    expect(notifications.sent).toHaveLength(0);
  });

  it('does not offer or report SMS delivery for the default test stub', () => {
    const notifications = stubNotificationDelivery();
    render(
      <ConfirmationPanel
        confirmation={confirmation}
        notificationDelivery={notifications}
      />,
    );

    expect(screen.queryByLabelText('Text receipt to SMS')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Text receipt' })).toBeNull();
    expect(screen.queryByText(PUBLIC_TERMINAL_SMS_SENT_COPY)).toBeNull();
    expect(screen.getByText('Print this confirmation, then clear this computer before leaving.')).not.toBeNull();
  });

  it('hides trusted-reviewer controls from the print confirmation', () => {
    const css = readFileSync('src/app/app.css', 'utf8');
    const printStart = css.indexOf('@media print');
    const printEnd = css.indexOf('/* FW-0046', printStart);
    const printBlock = css.slice(printStart, printEnd);

    expect(printBlock).toContain('.trusted-reviewer');
    expect(printBlock).toContain('.confirmation-panel > a');
  });

  it('includes multi-party slices and progress state in terminal draft cleanup', () => {
    const baseKey = {
      formUrl: 'https://formspec.example.test/forms/joint-terminal',
      formVersion: '1.0.0',
      subjectRef: 'subject-a',
    };
    const policy: ResolvedMultiPartyPolicy = {
      tier: 'coEqual',
      invitationChannel: 'magic-link',
      parties: [
        {
          roleId: 'adult',
          label: 'Adult',
          role: 'coEqual',
          cardinality: { min: 2, max: 2 },
          visibilityScope: 'shared',
        },
        {
          roleId: 'sponsor',
          label: 'Sponsor',
          role: 'coEqual',
          cardinality: { min: 1, max: 1 },
          visibilityScope: 'shared',
        },
      ],
    };

    const keys = publicTerminalDraftKeysToClear({ draftKey: baseKey, multiPartyPolicy: policy });

    expect(keys).toEqual(expect.arrayContaining([
      baseKey,
      expect.objectContaining({ subjectRef: 'subject-a', partyRef: 'adult:1' }),
      expect.objectContaining({ subjectRef: 'subject-a', partyRef: 'adult:2' }),
      expect.objectContaining({ subjectRef: 'subject-a', partyRef: 'sponsor' }),
      expect.objectContaining({
        subjectRef: expect.stringMatching(/^formspec:multi-party:/),
        partyRef: '__formspec-multi-party-progress',
      }),
    ]));
    expect(keys).toHaveLength(5);
  });
});

describe('RespondentRuntime public-terminal cleanup (FW-0041)', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
  });

  it('deletes the local draft, revokes the identity session, and hides the receipt', async () => {
    const composition = publicTerminalComposition();
    const deleteDraft = vi.spyOn(composition.draftStore, 'delete');
    const invalidateSubject = vi.spyOn(composition.draftStore, 'invalidateSubject');
    const revoke = vi.spyOn(composition.identityProvider, 'revoke');

    await renderRuntime(composition);
    await waitForText('Public Terminal Form');
    await clickButton('Submit');
    await waitForText('Submission received');
    expect(text()).not.toContain('Text receipt');
    expect(text()).not.toContain(PUBLIC_TERMINAL_SMS_SENT_COPY);

    await clickButton('Clear this computer');
    await waitForText(PUBLIC_TERMINAL_CLEARED_TITLE);

    expect(deleteDraft).toHaveBeenCalledWith(expect.objectContaining({
      formUrl: PUBLIC_TERMINAL_FORM.url,
      formVersion: PUBLIC_TERMINAL_FORM.version,
    }));
    expect(invalidateSubject).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(text()).not.toContain('Submission received');
  });

  async function renderRuntime(composition: Composition): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    });
  }

  async function clickButton(label: string): Promise<void> {
    const button = Array.from(container?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.includes(label));
    if (!button) {
      throw new Error(`button not found: ${label}\n\n${text()}`);
    }
    await act(async () => {
      button.click();
      await tick();
    });
  }

  async function waitForText(expected: string, timeoutMs = 3000): Promise<void> {
    const started = Date.now();
    while (!text().includes(expected)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for text: ${expected}\n\n${text()}`);
      }
      await act(async () => {
        await tick();
      });
    }
  }

  function text(): string {
    return container?.textContent ?? '';
  }
});

const PUBLIC_TERMINAL_FORM: FormDefinition = {
  $formspec: '1.0',
  url: 'https://formspec.example.test/forms/public-terminal',
  version: '1.0.0',
  title: 'Public Terminal Form',
  items: [
    {
      key: 'note',
      type: 'field',
      label: 'Optional note',
      dataType: 'string',
    },
  ],
};

function publicTerminalComposition(): Composition {
  const definitionSource = stubDefinitionSource();
  definitionSource.registerDefinition(
    PUBLIC_TERMINAL_FORM.url,
    PUBLIC_TERMINAL_FORM,
    PUBLIC_TERMINAL_FORM.version,
  );
  definitionSource.registerDefinition(PUBLIC_TERMINAL_FORM.url, PUBLIC_TERMINAL_FORM);
  const submitTransport = stubSubmitTransport();

  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'unavailable',
    status: 'unavailable',
    documentPresentation: 'unavailable',
    fileUpload: 'unavailable',
    crossIssuerHistory: 'unavailable',
    offlineSubmit: 'unavailable',
    payment: 'unavailable',
    embed: 'unavailable',
    screener: 'unavailable',
    trustedReviewer: 'unavailable',
    bringYourOwnAssistant: 'unavailable',
    safeAddress: 'unavailable',
    duressAware: 'unavailable',
    multiParty: 'unavailable',
    recordLifecycle: 'unavailable',
  };
  const orgRuntimePolicy: OrgRuntimePolicy = {
    features: {
      respondentPlace: 'allowed',
      status: 'allowed',
      documentPresentation: 'allowed',
      fileUpload: 'allowed',
      crossIssuerHistory: 'allowed',
      offlineSubmit: 'allowed',
      payment: 'allowed',
      embed: 'allowed',
      screener: 'allowed',
      trustedReviewer: 'allowed',
      bringYourOwnAssistant: 'allowed',
      safeAddress: 'allowed',
      duressAware: 'allowed',
      multiParty: 'allowed',
      recordLifecycle: 'allowed',
    },
  };

  return {
    mode: 'demo',
    initialDefinitionUrl: PUBLIC_TERMINAL_FORM.url,
    definitionSource,
    draftStore: stubDraftStore(),
    submitTransport,
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(),
    statusReader: stubStatusReader(),
    attachmentStore: stubAttachmentStore(),
    respondentHistorySource: stubRespondentHistorySource(),
    offlineSubmitQueue: stubOfflineSubmitQueue({ transport: submitTransport }),
    paymentRailAdapter: stubPaymentRailAdapter(),
    embedTransport: stubEmbedTransport({ embedded: false }),
    screenerDocumentSource: stubScreenerDocumentSource(),
    ...unavailablePreallocatedFeaturePorts(),
    instanceCapabilities,
    orgRuntimePolicy,
    formRuntimePolicyExtractor: { extract: () => ({ features: {} }) },
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
