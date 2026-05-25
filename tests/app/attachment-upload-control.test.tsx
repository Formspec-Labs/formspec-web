import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LayoutNode } from '@formspec-org/layout';
import type { UseFieldResult } from '@formspec-org/react';
import {
  ATTACHMENT_DEFAULT_MAX_SIZE_BYTES,
  ATTACHMENT_DEFERRED_CAPABILITY_COPY,
  ATTACHMENT_LEGIBILITY_WARNING_COPY,
  FormspecWebAttachmentControl,
} from '../../src/app/attachment-upload-control.tsx';
import { AttachmentStoreProvider } from '../../src/app/AttachmentStoreProvider.tsx';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import {
  AttachmentUploadError,
  type AttachmentRef,
  type AttachmentStore,
  type ResumableAttachmentStore,
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
  // Cast through ArrayBufferLike → BlobPart to avoid TS DOM lib's
  // SharedArrayBuffer-vs-ArrayBuffer mismatch (the runtime accepts both).
  return new File([bytes as unknown as BlobPart], name, { type });
}

function stubLoadedImage({ width = 10, height = 10 }: { width?: number; height?: number } = {}): void {
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  });
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
  vi.unstubAllGlobals();
});

describe('FormspecWebAttachmentControl', () => {
  const existingAttachment: AttachmentRef = {
    kind: 'attachment-ref',
    uri: 'attachment:demo-existing',
    hash: 'sha256:00',
    size: 4,
    mimeType: 'application/pdf',
    filename: 'existing.pdf',
  };

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
        // L-1: the code drives the user-visible copy; adopter prose is kept off
        // the user surface so the vocabulary firewall stays clean.
        throw new AttachmentUploadError('adopter prose: ECONNREFUSED', { code: 'network' });
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

    // Renders code-keyed plain-language copy; does NOT render adopter prose.
    expect(container?.textContent ?? '').toContain('could not reach the upload service');
    expect(container?.textContent ?? '').not.toContain('ECONNREFUSED');
    expect(harness.readValue()).toBeNull();
  });

  it('preserves an existing single attachment when a replacement upload fails', async () => {
    const failing: AttachmentStore = {
      upload: async () => {
        throw new AttachmentUploadError('network down', { code: 'network' });
      },
    };
    const harness = makeFieldHarness({ initial: existingAttachment });
    render(
      <AttachmentStoreProvider value={failing}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [await fileFromBytes(new Uint8Array([9]), 'replacement.pdf')],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('could not reach the upload service');
    expect(harness.readValue()).toEqual(existingAttachment);
  });

  it('calls AttachmentStore.delete on remove when the adopter implements it (M-2)', async () => {
    const deleteSpy = vi.fn(async (_uri: string) => {});
    const store: AttachmentStore = {
      upload: async () => ({
        kind: 'attachment-ref',
        uri: 'attachment:demo-x',
        hash: 'sha256:00',
        size: 1,
        mimeType: 'application/pdf',
        filename: 'x.pdf',
      }),
      delete: deleteSpy,
    };
    const existing: AttachmentRef = {
      kind: 'attachment-ref',
      uri: 'attachment:demo-existing',
      hash: 'sha256:00',
      size: 4,
      mimeType: 'application/pdf',
      filename: 'existing.pdf',
    };
    const harness = makeFieldHarness({ initial: existing });
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );
    const removeBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.getAttribute('aria-label') === 'Remove existing.pdf');
    expect(removeBtn).toBeTruthy();
    await act(async () => {
      removeBtn?.click();
      await flush();
    });
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith('attachment:demo-existing');
  });

  it('does not blow up when removing if the adopter omits delete (M-2 — optional)', async () => {
    // Store with NO delete method — the renderer must not throw.
    const store: AttachmentStore = {
      upload: async () => ({
        kind: 'attachment-ref',
        uri: 'attachment:nope',
        hash: 'sha256:00',
        size: 1,
        mimeType: 'application/pdf',
        filename: 'x.pdf',
      }),
    };
    const existing: AttachmentRef = {
      kind: 'attachment-ref',
      uri: 'attachment:demo-existing',
      hash: 'sha256:00',
      size: 4,
      mimeType: 'application/pdf',
      filename: 'existing.pdf',
    };
    const harness = makeFieldHarness({ initial: existing });
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );
    const removeBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.getAttribute('aria-label') === 'Remove existing.pdf');
    await act(async () => {
      removeBtn?.click();
      await flush();
    });
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

  it('applies a sane default maxSize so an over-limit file is rejected even without prop override (L-2)', async () => {
    // Default cap is 25 MiB. Build a File with size > default by stubbing size
    // (a real ArrayBuffer of that size would slow the test).
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const big = await fileFromBytes(new Uint8Array([0]), 'big.bin');
    Object.defineProperty(big, 'size', {
      value: ATTACHMENT_DEFAULT_MAX_SIZE_BYTES + 1,
      configurable: true,
    });
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('larger than the upload limit');
    expect(harness.readValue()).toBeNull();
  });

  it('client-side rejects a file whose MIME does not match `accept` (L-2)', async () => {
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl
          field={harness.field}
          node={makeNode({ accept: 'application/pdf,image/*' })}
        />
      </AttachmentStoreProvider>,
    );

    const txt = await fileFromBytes(new Uint8Array([1, 2]), 'note.txt', 'text/plain');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [txt], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    // Mime-rejected code -> "That file type is not accepted here."
    expect(container?.textContent ?? '').toContain('file type is not accepted');
    expect(harness.readValue()).toBeNull();
  });

  it('does not accept drag-drop uploads while readonly', async () => {
    const uploadSpy = vi.fn(async (): Promise<AttachmentRef> => ({
      kind: 'attachment-ref',
      uri: 'attachment:readonly-drop',
      hash: 'sha256:00',
      size: 1,
      mimeType: 'application/pdf',
      filename: 'drop.pdf',
    }));
    const harness = makeFieldHarness({ initial: existingAttachment, readonly: true });
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ dragDrop: true })} />
      </AttachmentStoreProvider>,
    );

    const dropZone = container!.querySelector('.formspec-file-drop-zone') as HTMLDivElement;
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [await fileFromBytes(new Uint8Array([1]), 'drop.pdf')] },
      configurable: true,
    });
    await act(async () => {
      dropZone.dispatchEvent(dropEvent);
      await flush();
    });

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(harness.readValue()).toEqual(existingAttachment);
  });

  it('opens image review for a file that matches `accept` via wildcard before upload', async () => {
    stubLoadedImage();
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl
          field={harness.field}
          node={makeNode({ accept: 'image/*' })}
        />
      </AttachmentStoreProvider>,
    );

    const png = await fileFromBytes(new Uint8Array([1]), 'photo.png', 'image/png');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('Upload image');
    const uploadBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Upload image');
    await act(async () => {
      uploadBtn?.click();
      await flush();
    });
    await flush();

    expect(harness.readValue()).toBeTruthy();
  });

  it('uses canvas legibility analysis for picked images before upload', async () => {
    stubLoadedImage({ width: 1280, height: 720 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(96 * 96 * 4).fill(120) }),
    } as unknown as CanvasRenderingContext2D);
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl
          field={harness.field}
          node={makeNode({ accept: 'image/*' })}
        />
      </AttachmentStoreProvider>,
    );

    const png = await fileFromBytes(new Uint8Array(5000).fill(1), 'photo.png', 'image/png');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain(ATTACHMENT_LEGIBILITY_WARNING_COPY);
    expect(harness.readValue()).toBeNull();
  });

  it('uploads non-image siblings and queues every image from a multiple-file batch', async () => {
    stubLoadedImage();
    const uploadSpy = vi.fn(async (blob: Blob, metadata): Promise<AttachmentRef> => ({
      kind: 'attachment-ref',
      uri: `attachment:${metadata.filename}`,
      hash: 'sha256:00',
      size: blob.size,
      mimeType: metadata.mimeType,
      filename: metadata.filename,
    }));
    let observedValue: unknown = null;
    function LiveHarness() {
      const [value, setValue] = useState<unknown>(null);
      useEffect(() => {
        observedValue = value;
      }, [value]);
      const field = {
        ...makeFieldHarness().field,
        value,
        setValue,
      } as unknown as UseFieldResult;
      return <FormspecWebAttachmentControl field={field} node={makeNode({ multiple: true })} />;
    }
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <LiveHarness />
      </AttachmentStoreProvider>,
    );

    const files = [
      await fileFromBytes(new Uint8Array([1]), 'a.pdf', 'application/pdf'),
      await fileFromBytes(new Uint8Array([2]), 'photo.png', 'image/png'),
      await fileFromBytes(new Uint8Array([3]), 'b.pdf', 'application/pdf'),
      await fileFromBytes(new Uint8Array([4]), 'scan.jpg', 'image/jpeg'),
    ];
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();

    expect(uploadSpy).toHaveBeenCalledTimes(2);
    expect(container?.textContent ?? '').toContain('1 image waiting for review');

    for (let index = 0; index < 2; index += 1) {
      const uploadBtn = Array.from(container!.querySelectorAll('button'))
        .find((btn) => btn.textContent === 'Upload image');
      await act(async () => {
        uploadBtn?.click();
        await flush();
      });
      await flush();
    }

    expect(uploadSpy).toHaveBeenCalledTimes(4);
    expect((observedValue as AttachmentRef[]).map((ref) => ref.filename)).toEqual([
      'a.pdf',
      'b.pdf',
      'photo.png',
      'scan.jpg',
    ]);
  });

  it('revalidates the rendered image before upload after on-device redaction', async () => {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      naturalWidth = 10;
      naturalHeight = 10;
      width = 10;
      height = 10;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    } as HTMLCanvasElement['toBlob']);
    const uploadSpy = vi.fn(async (): Promise<AttachmentRef> => ({
      kind: 'attachment-ref',
      uri: 'attachment:redacted',
      hash: 'sha256:00',
      size: 3,
      mimeType: 'image/png',
      filename: 'photo.png',
    }));
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*', maxSize: 2 })} />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [await fileFromBytes(new Uint8Array([1]), 'photo.png', 'image/png')],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    const addRedactionBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Add redaction box');
    await act(async () => {
      addRedactionBtn?.click();
      await flush();
    });
    const uploadBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Upload image');
    await act(async () => {
      uploadBtn?.click();
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('larger than the upload limit');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(harness.readValue()).toBeNull();
  });

  it('uploads only the rendered redacted image when redactions exist', async () => {
    stubLoadedImage({ width: 10, height: 10 });
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect,
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }));
    } as HTMLCanvasElement['toBlob']);
    let uploadedBytes: number[] = [];
    const uploadSpy = vi.fn(async (blob: Blob, metadata): Promise<AttachmentRef> => {
      uploadedBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return {
        kind: 'attachment-ref',
        uri: 'attachment:redacted',
        hash: 'sha256:00',
        size: blob.size,
        mimeType: metadata.mimeType,
        filename: metadata.filename,
      };
    });
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*' })} />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [await fileFromBytes(new Uint8Array([1, 2, 3, 4]), 'photo.png', 'image/png')],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();
    const addRedactionBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Add redaction box');
    await act(async () => {
      addRedactionBtn?.click();
      await flush();
    });
    const uploadBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Upload image');
    await act(async () => {
      uploadBtn?.click();
      await flush();
    });
    await flush();

    expect(fillRect).toHaveBeenCalledWith(3, 3, 5, 2);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadedBytes).toEqual([9, 8, 7]);
    expect((harness.readValue() as AttachmentRef).filename).toBe('photo.png');
  });

  it('clears stale redaction coordinates when page-edge detection crops the image', async () => {
    stubLoadedImage({ width: 4, height: 4 });
    const pageData = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    for (let y = 1; y <= 2; y += 1) {
      for (let x = 1; x <= 2; x += 1) {
        const index = (y * 4 + x) * 4;
        pageData[index] = 0;
        pageData[index + 1] = 0;
        pageData[index + 2] = 0;
      }
    }
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect,
      getImageData: () => ({ data: pageData }),
    } as unknown as CanvasRenderingContext2D);
    let toBlobCalls = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      toBlobCalls += 1;
      callback(new Blob([new Uint8Array(toBlobCalls === 1 ? [4, 4, 4] : [9, 9, 9])], { type: 'image/png' }));
    } as HTMLCanvasElement['toBlob']);
    let uploadedBytes: number[] = [];
    const uploadSpy = vi.fn(async (blob: Blob, metadata): Promise<AttachmentRef> => {
      uploadedBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return {
        kind: 'attachment-ref',
        uri: 'attachment:cropped',
        hash: 'sha256:00',
        size: blob.size,
        mimeType: metadata.mimeType,
        filename: metadata.filename,
      };
    });
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*' })} />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [await fileFromBytes(new Uint8Array([1, 2, 3, 4]), 'photo.png', 'image/png')],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await flush();
    const addRedactionBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Add redaction box');
    await act(async () => {
      addRedactionBtn?.click();
      await flush();
    });
    const detectBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Detect page edges');
    await act(async () => {
      detectBtn?.click();
      await flush();
    });
    await flush();
    const uploadBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Upload image');
    await act(async () => {
      uploadBtn?.click();
      await flush();
    });
    await flush();

    expect(fillRect).not.toHaveBeenCalled();
    expect(toBlobCalls).toBe(1);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadedBytes).toEqual([4, 4, 4]);
  });

  it('uploads a successful camera capture through the same AttachmentStore path', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop }],
        })),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(96 * 96 * 4) }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob([new Uint8Array([5, 6, 7])], { type: 'image/jpeg' }));
    } as HTMLCanvasElement['toBlob']);
    let uploadedBytes: number[] = [];
    const uploadSpy = vi.fn(async (blob: Blob, metadata): Promise<AttachmentRef> => {
      uploadedBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return {
        kind: 'attachment-ref',
        uri: 'attachment:camera',
        hash: 'sha256:00',
        size: blob.size,
        mimeType: metadata.mimeType,
        filename: metadata.filename,
      };
    });
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*' })} />
      </AttachmentStoreProvider>,
    );

    const cameraBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Use camera');
    await act(async () => {
      cameraBtn?.click();
      await flush();
    });
    const captureBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Capture image');
    await act(async () => {
      captureBtn?.click();
      await flush();
    });
    await flush();
    const uploadBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Upload image');
    await act(async () => {
      uploadBtn?.click();
      await flush();
    });
    await flush();

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadedBytes).toEqual([5, 6, 7]);
    expect((harness.readValue() as AttachmentRef).filename).toBe('camera-capture.jpg');
    expect(stop).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('enforces accept constraints on camera captures before image review upload', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop }],
        })),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
      callback(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    } as HTMLCanvasElement['toBlob']);
    const uploadSpy = vi.fn(async (): Promise<AttachmentRef> => ({
      kind: 'attachment-ref',
      uri: 'attachment:camera',
      hash: 'sha256:00',
      size: 1,
      mimeType: 'image/jpeg',
      filename: 'camera-capture.jpg',
    }));
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={{ upload: uploadSpy }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'application/pdf' })} />
      </AttachmentStoreProvider>,
    );

    const cameraBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Use camera');
    await act(async () => {
      cameraBtn?.click();
      await flush();
    });
    const captureBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Capture image');
    await act(async () => {
      captureBtn?.click();
      await flush();
    });
    await flush();

    expect(container?.textContent ?? '').toContain('file type is not accepted');
    expect(container?.textContent ?? '').not.toContain('Upload image');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(harness.readValue()).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('stops a camera stream that resolves after the control unmounts', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    let resolveStream: (stream: MediaStream) => void = () => {};
    const streamPromise = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => streamPromise),
      },
      configurable: true,
    });
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const cameraBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Use camera');
    await act(async () => {
      cameraBtn?.click();
      await flush();
    });
    act(() => {
      root?.unmount();
    });
    root = undefined;
    await act(async () => {
      resolveStream(stream);
      await flush();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
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

  it('uses the resumable upload extension when the adapter provides it and renders progress', async () => {
    let finishUpload: () => void = () => {};
    const finishPromise = new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    const store: ResumableAttachmentStore = {
      upload: async () => {
        throw new Error('baseline upload should not be used');
      },
      uploadResumable: async (_blob, metadata, options) => {
        options?.onProgress?.({
          loadedBytes: 1,
          totalBytes: 4,
          chunksUploaded: 1,
          chunkCount: 4,
        });
        await finishPromise;
        options?.onProgress?.({
          loadedBytes: 4,
          totalBytes: 4,
          chunksUploaded: 4,
          chunkCount: 4,
        });
        return {
          kind: 'attachment-ref',
          uri: 'attachment:resumable',
          hash: 'sha256:00',
          size: 4,
          mimeType: metadata.mimeType,
          filename: metadata.filename,
        };
      },
    };
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [await fileFromBytes(new Uint8Array([1, 2, 3, 4]), 'x.pdf')],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    expect(container?.textContent ?? '').toContain('Uploading 25%');
    await act(async () => {
      finishUpload();
      await flush();
    });
    await flush();
    expect((harness.readValue() as AttachmentRef).uri).toBe('attachment:resumable');
  });

  it('surfaces camera capture unavailability without blocking file pick', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode()} />
      </AttachmentStoreProvider>,
    );
    const cameraBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Use camera');
    await act(async () => {
      cameraBtn?.click();
      await flush();
    });
    expect(container?.textContent ?? '').toContain('Camera capture is not available');
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('does NOT resurrect a concurrently-removed ref when an upload settles after the remove (H-1 closure-stale race)', async () => {
    // Manual-promise upload so the test controls settle ordering.
    let resolveUpload: (ref: AttachmentRef) => void = () => {};
    const uploadPromise = new Promise<AttachmentRef>((resolve) => {
      resolveUpload = resolve;
    });
    const racingStore: AttachmentStore = {
      upload: async () => uploadPromise,
    };

    const existing: AttachmentRef = {
      kind: 'attachment-ref',
      uri: 'attachment:demo-existing',
      hash: 'sha256:00',
      size: 4,
      mimeType: 'application/pdf',
      filename: 'existing.pdf',
    };

    // Live harness wrapper: setValue triggers a re-render (matching the
    // production engine contract) so the H-1 fix's fieldValueRef can observe
    // the post-remove field.value before the upload settles.
    let observedValue: unknown = null;
    const setObserved = vi.fn();
    function LiveHarness() {
      const [value, setValue] = useState<unknown>([existing]);
      useEffect(() => {
        observedValue = value;
        setObserved(value);
      }, [value]);
      const field = {
        id: 'fld-lease',
        path: 'lease',
        itemKey: 'lease',
        dataType: 'attachment',
        label: 'Lease',
        hint: null,
        description: null,
        value,
        required: true,
        visible: true,
        readonly: false,
        touched: false,
        errors: [],
        error: null,
        options: [],
        optionsState: { loading: false, error: null },
        disabledDisplay: 'hidden' as const,
        setValue,
        touch: () => {},
        inputProps: {
          id: 'fld-lease',
          name: 'lease',
          value: '',
          onChange: () => {},
          onBlur: () => {},
          required: true,
          readOnly: false,
          'aria-invalid': false,
          'aria-required': true,
        },
      } as unknown as UseFieldResult;
      return <FormspecWebAttachmentControl field={field} node={makeNode({ multiple: true })} />;
    }
    render(
      <AttachmentStoreProvider value={racingStore}>
        <LiveHarness />
      </AttachmentStoreProvider>,
    );

    // 1. Start an upload (it's pending — the store hasn't resolved yet).
    const newFile = await fileFromBytes(new Uint8Array([9, 9, 9]), 'new.pdf');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [newFile], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });

    // 2. While the upload is in flight, user clicks Remove on the existing ref.
    const removeBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.getAttribute('aria-label') === 'Remove existing.pdf');
    expect(removeBtn).toBeTruthy();
    await act(async () => {
      removeBtn?.click();
      await flush();
    });
    expect(observedValue).toEqual([]); // remove landed synchronously and a re-render fired.

    // 3. Resolve the upload AFTER the remove has landed.
    const uploadedRef: AttachmentRef = {
      kind: 'attachment-ref',
      uri: 'attachment:demo-uploaded',
      hash: 'sha256:99',
      size: 3,
      mimeType: 'application/pdf',
      filename: 'new.pdf',
    };
    await act(async () => {
      resolveUpload(uploadedRef);
      await flush();
    });
    await flush();

    // 4. Post-settle: the removed existing ref must NOT reappear. The field
    // value contains the uploaded ref only.
    const finalValue = observedValue as AttachmentRef[];
    expect(finalValue.map((ref) => ref.uri)).toEqual(['attachment:demo-uploaded']);
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
