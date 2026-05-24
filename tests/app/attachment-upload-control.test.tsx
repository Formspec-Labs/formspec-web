import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LayoutNode } from '@formspec-org/layout';
import type { UseFieldResult } from '@formspec-org/react';
import {
  ATTACHMENT_DEFERRED_CAPABILITY_COPY,
  FormspecWebAttachmentControl,
} from '../../src/app/attachment-upload-control.tsx';
import { AttachmentStoreProvider } from '../../src/app/AttachmentStoreProvider.tsx';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import {
  AttachmentUploadError,
  type AttachmentRef,
  type AttachmentStore,
} from '../../src/ports/attachment-store.ts';

interface FieldHarness {
  field: UseFieldResult;
  readValue(): unknown;
}

function makeFieldHarness({
  initial,
  readonly = false,
}: {
  initial?: unknown;
  readonly?: boolean;
} = {}): FieldHarness {
  let value: unknown = initial ?? null;
  const setValue = vi.fn((next: unknown) => {
    value = next;
  });
  const touch = vi.fn();
  const field: UseFieldResult = {
    id: 'fld-lease',
    path: 'lease',
    itemKey: 'lease',
    dataType: 'attachment',
    label: 'Lease',
    hint: null,
    description: null,
    get value() {
      return value;
    },
    required: true,
    visible: true,
    readonly,
    touched: false,
    errors: [],
    error: null,
    options: [],
    optionsState: { loading: false, error: null },
    disabledDisplay: 'hidden',
    setValue,
    touch,
    inputProps: {
      id: 'fld-lease',
      name: 'lease',
      value: '',
      onChange: () => {},
      onBlur: () => {},
      required: true,
      readOnly: readonly,
      'aria-invalid': false,
      'aria-required': true,
    },
  } as UseFieldResult;
  return {
    field,
    readValue: () => value,
  };
}

function makeNode(props: Record<string, unknown> = {}): LayoutNode {
  return {
    component: 'FileUpload',
    bindPath: 'lease',
    props: { dragDrop: false, ...props },
  } as unknown as LayoutNode;
}

async function fileFromBytes(bytes: Uint8Array, name: string, type = 'application/pdf'): Promise<File> {
  return new File([bytes], name, { type });
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(node: React.ReactNode): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

describe('FormspecWebAttachmentControl', () => {
  it('uploads a picked file through the AttachmentStore and writes the AttachmentRef into the engine value (single)', async () => {
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const file = await fileFromBytes(new Uint8Array([1, 2, 3, 4]), 'lease.pdf');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    const written = harness.readValue() as AttachmentRef | null;
    expect(written).toBeTruthy();
    expect(written?.kind).toBe('attachment-ref');
    expect(written?.filename).toBe('lease.pdf');
    expect(written?.size).toBe(4);
    expect(written?.uri.startsWith('attachment:')).toBe(true);
  });

  it('uploads many files and writes AttachmentRef[] in `multiple` mode', async () => {
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ multiple: true })} />
      </AttachmentStoreProvider>,
    );

    const files = [
      await fileFromBytes(new Uint8Array([1]), 'a.pdf'),
      await fileFromBytes(new Uint8Array([2]), 'b.pdf'),
    ];
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    const written = harness.readValue() as AttachmentRef[];
    expect(Array.isArray(written)).toBe(true);
    expect(written.map((ref) => ref.filename)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('shows an inline error and does NOT touch the engine value when upload fails', async () => {
    const failing: AttachmentStore = {
      upload: async () => {
        throw new AttachmentUploadError('Network timeout — try again.');
      },
    };
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={failing}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [await fileFromBytes(new Uint8Array([1]), 'x.pdf')], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('Network timeout');
    expect(harness.readValue()).toBeNull();
  });

  it('removes an existing AttachmentRef from the field value', async () => {
    const harness = makeFieldHarness({
      initial: { kind: 'attachment-ref', uri: 'attachment:demo-1', hash: 'sha256:00', size: 4, mimeType: 'application/pdf', filename: 'lease.pdf' } satisfies AttachmentRef,
    });
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const removeBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.getAttribute('aria-label')?.startsWith('Remove'));
    expect(removeBtn).toBeTruthy();
    await act(async () => {
      removeBtn?.click();
      await flush();
    });
    expect(harness.readValue()).toBeNull();
  });

  it('rejects a file that exceeds maxSize with a plain-language message', async () => {
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ maxSize: 2 })} />
      </AttachmentStoreProvider>,
    );

    const oversized = await fileFromBytes(new Uint8Array([1, 2, 3, 4, 5]), 'big.pdf');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [oversized], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('larger than the upload limit');
    expect(harness.readValue()).toBeNull();
  });

  it('pins the deferred-capability copy verbatim', () => {
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );
    expect(container?.textContent ?? '').toContain(ATTACHMENT_DEFERRED_CAPABILITY_COPY);
  });

  it('respects the vocabulary firewall — no spec / port / cryptographic jargon in DOM', () => {
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );
    const dom = container?.outerHTML ?? '';
    for (const banned of ['attachment-ref', 'attachmentStore', 'AttachmentRef', 'sha256:', 'fileUpload', 'multipart', 's3://']) {
      expect(dom).not.toContain(banned);
    }
  });
});
