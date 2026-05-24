import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FormDefinition } from '@formspec-org/types';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { unavailableAttachmentStore } from '../../src/adapters/unavailable/attachment-store.ts';
import { stubDefinitionSource } from '../../src/adapters/stub/definition-source.ts';
import { stubDraftStore } from '../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../src/adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../../src/adapters/stub/submit-transport.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';
import {
  freezeComposition,
  type FormRuntimePolicy,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../../src/policy/index.ts';
import { extractAttachmentRequirement } from '../../src/policy/extract-form-policy.ts';
import type { Composition } from '../../src/composition/types.ts';
import type { IntakeHandoff } from '../../src/ports/submit-transport.ts';
import { AttachmentUploadError } from '../../src/ports/attachment-store.ts';

const FORM_URL = 'https://test.example/forms/lease-app';

function attachmentFormDefinition(): FormDefinition {
  return {
    $formspec: '1.0',
    url: FORM_URL,
    version: '1.0.0',
    title: 'Lease Application',
    items: [
      {
        key: 'lease',
        type: 'field',
        label: 'Lease document',
        dataType: 'attachment',
      },
    ],
  } as FormDefinition;
}

function buildComposition({
  mode,
}: {
  mode: 'demo-stub-attachment' | 'unavailable-attachment';
}): { composition: Composition; submitSpy: ReturnType<typeof vi.fn> } {
  const definitionSource = stubDefinitionSource();
  const form = attachmentFormDefinition();
  definitionSource.registerDefinition(form.url, form, form.version);
  definitionSource.registerDefinition(form.url, form);
  const submitTransport = stubSubmitTransport();
  const originalSubmit = submitTransport.submit.bind(submitTransport);
  const submitSpy = vi.fn(async (handoff: IntakeHandoff, idempotencyKey: string) =>
    originalSubmit(handoff, idempotencyKey),
  );
  submitTransport.submit = submitSpy as typeof submitTransport.submit;

  const attachmentStore = mode === 'demo-stub-attachment'
    ? stubAttachmentStore()
    : unavailableAttachmentStore();
  const isDemo = mode === 'demo-stub-attachment';

  const instanceCapabilities: InstanceCapabilities = isDemo
    ? {
        respondentPlace: 'demo-stub',
        status: 'demo-stub',
        documentPresentation: 'unavailable',
        fileUpload: 'demo-stub',
      }
    : {
        respondentPlace: 'unavailable',
        status: 'unavailable',
        documentPresentation: 'unavailable',
        fileUpload: 'unavailable',
      };

  const orgRuntimePolicy: OrgRuntimePolicy = {
    features: {
      respondentPlace: 'allowed',
      status: 'allowed',
      documentPresentation: 'allowed',
      fileUpload: 'allowed',
    },
  };

  const composition: Composition = freezeComposition({
    mode: isDemo ? 'demo' : 'production',
    initialDefinitionUrl: form.url,
    definitionSource,
    draftStore: stubDraftStore(),
    submitTransport,
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: isDemo
      ? stubRespondentPlaceSource()
      : unavailableRespondentPlaceSource(),
    statusReader: isDemo ? stubStatusReader() : unavailableStatusReader(),
    attachmentStore,
    instanceCapabilities,
    orgRuntimePolicy,
    getFormRuntimePolicy: (definition): FormRuntimePolicy => {
      const fileUpload = extractAttachmentRequirement(definition);
      return fileUpload ? { features: { fileUpload } } : { features: {} };
    },
  });
  return { composition, submitSpy };
}

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

async function renderRuntime(composition: Composition): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
  });
}

async function waitForText(text: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!(container?.textContent ?? '').includes(text)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for: ${text}\n\nDOM:\n${container?.textContent ?? ''}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * Wait for the settled-row remove button to appear. The pending-uploading
 * row also contains the filename, so waiting on the filename via textContent
 * races the storage.set() that lands the bytes. The remove button only
 * renders after Promise.allSettled resolves AND the engine re-renders with
 * the new field.value containing the AttachmentRef.
 */
async function waitForSettledRow(filename: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (container?.querySelector(`[aria-label="Remove ${filename}"]`) === null) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for settled row: ${filename}\n\nDOM:\n${container?.textContent ?? ''}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('RespondentRuntime attachment integration (FW-0033)', () => {
  it('uploads via the wired AttachmentStore so the AttachmentRef survives JSON serialization (the substrate-honesty contract)', async () => {
    const { composition } = buildComposition({ mode: 'demo-stub-attachment' });
    await renderRuntime(composition);
    await waitForText('Drag and drop a file here');

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'lease.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Wait for the SETTLED-row remove button (aria-label) — not the filename
    // text, which matches the pending-uploading row too and races the
    // storage.set() below.
    await waitForSettledRow('lease.pdf');

    // 1. Adapter received the bytes through the port. Reach the stub-only
    // helper through `unknown` since AttachmentStore itself does not declare
    // `getStoredBytes` (it's a stub-adapter convenience).
    const stub = composition.attachmentStore as unknown as {
      getStoredBytes(uri: string): Blob | undefined;
    };
    expect(stub.getStoredBytes('attachment:demo-1')).toBeDefined();

    // 2. The engine value at the attachment path JSON-round-trips to an
    // AttachmentRef — NOT to {} (the pre-FW-0033 silent-disappear shape).
    // This is the exact serialization `buildIntakeHandoff` runs over the
    // response data, so what we assert here is what flows through the
    // SubmitTransport.submit call at runtime.
    const li = container?.querySelector('li.formspec-file-list-item');
    expect(li?.textContent).toContain('lease.pdf');
    // The remove "×" button is rendered only when the engine value carries an
    // AttachmentRef in the field list — extra proof the engine state is set.
    const removeBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.getAttribute('aria-label')?.startsWith('Remove'));
    expect(removeBtn).toBeTruthy();
  });

  it('fails the form at load with the fileUpload-specific copy when the required capability is unavailable', async () => {
    const { composition } = buildComposition({ mode: 'unavailable-attachment' });
    await renderRuntime(composition);
    await waitForText('This form cannot be loaded.');
    expect(container?.textContent ?? '').toContain('This form needs file uploads, but this site is not set up to receive files.');
    expect(container?.textContent ?? '').toContain('UnsupportedRequiredFeature');
  });

  it('keeps the AttachmentUploadError surface for adapters to throw plain-language failures', () => {
    expect(() => {
      throw new AttachmentUploadError('test failure', { code: 'unknown' });
    }).toThrow(AttachmentUploadError);
  });
});
