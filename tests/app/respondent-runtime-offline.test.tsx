import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FormDefinition } from '@formspec-org/types';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { stubRespondentHistorySource } from '../../src/adapters/stub/respondent-history-source.ts';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import { unavailableOfflineSubmitQueue } from '../../src/adapters/unavailable/offline-submit-queue.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../../src/policy/index.ts';
import {
  CompositeFormRuntimePolicyExtractor,
  OfflineSubmitRequirementExtractor,
} from '../../src/adapters/composing/form-runtime-policy-extractor.ts';
import type { Composition } from '../../src/composition/types.ts';

const FORM_URL = 'https://test.example/forms/offline-demo';

function offlineCapableFormDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: FORM_URL,
    version: '1.0.0',
    title: 'Field Survey',
    items: [
      {
        key: 'observation',
        type: 'field',
        dataType: 'string',
        label: 'What did you observe?',
      },
    ],
    extensions: { 'x-formspec-offline-submit': true },
  } as FormDefinition;
}

function nonOfflineFormDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: FORM_URL,
    version: '1.0.0',
    title: 'Plain Form',
    items: [
      {
        key: 'observation',
        type: 'field',
        dataType: 'string',
        label: 'What did you observe?',
      },
    ],
  } as FormDefinition;
}

function buildComposition({
  definition,
  offlineQueueAvailable,
}: {
  definition: FormDefinition;
  offlineQueueAvailable: boolean;
}): Composition {
  const definitionSource = stubDefinitionSource();
  definitionSource.registerDefinition(definition.url, definition, definition.version);
  definitionSource.registerDefinition(definition.url, definition);

  const submitTransport = stubSubmitTransport();

  const offlineSubmitQueue = offlineQueueAvailable
    ? stubOfflineSubmitQueue({ transport: submitTransport })
    : unavailableOfflineSubmitQueue();

  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'demo-stub',
    status: 'demo-stub',
    documentPresentation: 'unavailable',
    fileUpload: 'demo-stub',
    crossIssuerHistory: 'demo-stub',
    offlineSubmit: offlineQueueAvailable ? 'demo-stub' : 'unavailable',
  };
  const orgRuntimePolicy: OrgRuntimePolicy = {
    features: {
      respondentPlace: 'allowed',
      status: 'allowed',
      documentPresentation: 'allowed',
      fileUpload: 'allowed',
      crossIssuerHistory: 'allowed',
      offlineSubmit: 'allowed',
    },
  };

  return freezeComposition({
    mode: 'demo',
    initialDefinitionUrl: definition.url,
    definitionSource,
    draftStore: stubDraftStore(),
    submitTransport,
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(),
    statusReader: stubStatusReader(),
    attachmentStore: stubAttachmentStore(),
    respondentHistorySource: stubRespondentHistorySource(),
    offlineSubmitQueue,
    instanceCapabilities,
    orgRuntimePolicy,
    formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
      new OfflineSubmitRequirementExtractor(),
    ]),
  });
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  // Default: navigator reports online. Each test overrides as needed.
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

async function renderRuntime(composition: Composition): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out\n\nDOM:\n${container?.textContent ?? ''}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function setOnline(value: boolean): void {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value,
    configurable: true,
    writable: true,
  });
}

async function clickSubmit(): Promise<void> {
  const button = Array.from(container!.querySelectorAll('button')).find(
    (b) => (b.textContent || '').toLowerCase().includes('submit'),
  );
  if (!button) throw new Error('submit button not found');
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('RespondentRuntime offline integration (FW-0044)', () => {
  it('routes the submission to the offline queue when offline AND the form opts in', async () => {
    const composition = buildComposition({
      definition: offlineCapableFormDefinition(),
      offlineQueueAvailable: true,
    });
    const enqueueSpy = vi.spyOn(composition.offlineSubmitQueue, 'enqueue');
    const transportSpy = vi.spyOn(composition.submitTransport, 'submit');

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    setOnline(false);
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes('Saved for later'));

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(transportSpy).not.toHaveBeenCalled();
    const pendingCount = (
      composition.offlineSubmitQueue as unknown as { _internalPendingCount(): number }
    )._internalPendingCount();
    expect(pendingCount).toBe(1);
    expect(container?.textContent).toContain("We'll send it when you reconnect.");
  });

  it('replays the queue on the online event and surfaces the confirmation', async () => {
    const composition = buildComposition({
      definition: offlineCapableFormDefinition(),
      offlineQueueAvailable: true,
    });

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    setOnline(false);
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes('Saved for later'));

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => (container?.textContent ?? '').includes('Submission received'));

    const pendingCount = (
      composition.offlineSubmitQueue as unknown as { _internalPendingCount(): number }
    )._internalPendingCount();
    expect(pendingCount).toBe(0);
    expect(container?.textContent).toContain('Submission received');
  });

  it('falls through to the synchronous transport path when offline but the form does not opt in', async () => {
    const composition = buildComposition({
      definition: nonOfflineFormDefinition(),
      offlineQueueAvailable: true,
    });
    const enqueueSpy = vi.spyOn(composition.offlineSubmitQueue, 'enqueue');
    const transportSpy = vi.spyOn(composition.submitTransport, 'submit');

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    setOnline(false);
    await clickSubmit();
    // Stub submit transport accepts unconditionally — so the form
    // confirms; the load-bearing assertion is that the queue path was NOT
    // taken.
    await waitFor(
      () =>
        (container?.textContent ?? '').includes('Submission received') ||
        (container?.textContent ?? '').includes('Saved for later') ||
        (container?.textContent ?? '').includes('We could not submit'),
    );

    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(transportSpy).toHaveBeenCalledTimes(1);
    expect(container?.textContent).not.toContain('Saved for later');
  });

  it('takes the synchronous transport path when online (queue never touched)', async () => {
    const composition = buildComposition({
      definition: offlineCapableFormDefinition(),
      offlineQueueAvailable: true,
    });
    const enqueueSpy = vi.spyOn(composition.offlineSubmitQueue, 'enqueue');
    const transportSpy = vi.spyOn(composition.submitTransport, 'submit');

    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    setOnline(true);
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes('Submission received'));

    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(transportSpy).toHaveBeenCalledTimes(1);
  });

  it('vocabulary firewall — DOM does not leak queue / IndexedDB / service-worker / port jargon', async () => {
    const composition = buildComposition({
      definition: offlineCapableFormDefinition(),
      offlineQueueAvailable: true,
    });
    await renderRuntime(composition);
    await waitFor(() => Boolean(container?.querySelector('button')));
    setOnline(false);
    await clickSubmit();
    await waitFor(() => (container?.textContent ?? '').includes('Saved for later'));
    const dom = (container?.textContent ?? '').toLowerCase();
    for (const forbidden of [
      'enqueue',
      'replay',
      'idempotency',
      'idempotencykey',
      'indexeddb',
      'service worker',
      'offlinesubmitqueue',
      'offlinesubmit',
      'queuedsubmit',
    ]) {
      expect(dom).not.toContain(forbidden);
    }
  });
});
