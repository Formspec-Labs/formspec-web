import { describe, expect, it, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { act, StrictMode, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UI_STRINGS, type LayoutNode } from '@formspec-org/layout';
import { FormspecProvider } from '@formspec-org/react';
import { createFormEngine } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { UseFieldResult } from '@formspec-org/react';
import {
  ATTACHMENT_DEFAULT_MAX_SIZE_BYTES,
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
  /**
   * Resolves on the control's next write. The stub store hashes with WebCrypto,
   * which settles on the libuv thread pool after an unbounded number of
   * event-loop turns, so upload tests await the write rather than count flushes.
   */
  nextWrite(): Promise<unknown>;
}

function makeFieldHarness({
  initial,
  readonly = false,
}: {
  initial?: unknown;
  readonly?: boolean;
} = {}): FieldHarness {
  let value: unknown = initial ?? null;
  let onWrite: ((next: unknown) => void) | undefined;
  const setValue = vi.fn((next: unknown) => {
    value = next;
    onWrite?.(next);
  });
  const touch = vi.fn();
  const field: UseFieldResult = {
    id: 'fld-lease',
    path: 'lease',
    itemKey: 'lease',
    dataType: 'attachment',
    label: 'Lease',
    labelNeedAnchors: [],
    hint: null,
    hintNeedAnchors: [],
    description: null,
    descriptionNeedAnchors: [],
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
    nextWrite: () => new Promise((resolve) => { onWrite = resolve; }),
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

beforeAll(() => initFormspecEngine());
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

  it('re-resolves existing validation and camera errors with literal parameters after a locale switch', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const definitionUrl = 'https://example.test/forms/upload-chrome';
    const engine = createFormEngine({ $formspec: '1.0', url: definitionUrl, version: '1.0.0', title: 'Upload chrome', items: [] });
    const upload = vi.fn(stubAttachmentStore().upload);
    const harness = makeFieldHarness();
    try {
      render(<FormspecProvider engine={engine}><AttachmentStoreProvider value={{ upload }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ maxSize: 1024 })} />
      </AttachmentStoreProvider></FormspecProvider>);
      const filename = '{{$literal}}.pdf';
      const file = await fileFromBytes(new Uint8Array(1025), filename);
      const input = container!.querySelector('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
      const camera = Array.from(container!.querySelectorAll('button')).find(button => button.textContent === 'Use camera')!;
      await act(async () => { camera.click(); await flush(); });
      const failure = container!.querySelector('.formspec-file-pending-status')!;
      expect(failure.textContent).toBe('"{{$literal}}.pdf" is larger than the upload limit of 1.0 KiB.');
      expect(container!.textContent).toContain(UI_STRINGS['fileUpload.cameraUnavailable']);
      act(() => {
        engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
          target: { kind: 'definition', url: definitionUrl }, strings: {
            '$ui.fileUpload.fileTooLarge': '{{$filename}} supera el límite de {{$limit}}.',
            '$ui.fileUpload.dismissError': 'Descartar error de {{$filename}}',
            '$ui.fileUpload.cameraUnavailable': 'La cámara no está disponible.',
            '$ui.fileUpload.useCamera': 'Usar cámara',
            '$ui.screener.required': 'Obligatorio',
          } });
        engine.setLocale('es');
      });
      expect(failure.textContent).toBe('{{$literal}}.pdf supera el límite de 1.0 KiB.');
      expect(container!.querySelector('.formspec-file-pending-dismiss')!.getAttribute('aria-label')).toBe('Descartar error de {{$literal}}.pdf');
      expect(container!.textContent).toContain('La cámara no está disponible.');
      expect(camera.textContent).toBe('Usar cámara');
      expect(container!.querySelector('abbr')!.title).toBe('Obligatorio');
      expect(container!.textContent).toContain(UI_STRINGS['fileUpload.deferredLibrary']);
      act(() => engine.setLocale(''));
      expect(failure.textContent).toContain('larger than the upload limit');
      expect(container!.textContent).toContain(UI_STRINGS['fileUpload.cameraUnavailable']);
      expect(upload).not.toHaveBeenCalled();
      expect(harness.field.setValue).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
  });

  it('re-resolves an existing image warning and editor names without replacing or uploading the draft', async () => {
    stubLoadedImage();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const definitionUrl = 'https://example.test/forms/image-chrome';
    const engine = createFormEngine({ $formspec: '1.0', url: definitionUrl, version: '1.0.0', title: 'Upload chrome', items: [] });
    const upload = vi.fn(stubAttachmentStore().upload);
    const harness = makeFieldHarness();
    render(<FormspecProvider engine={engine}><AttachmentStoreProvider value={{ upload }}>
      <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*' })} />
    </AttachmentStoreProvider></FormspecProvider>);
    const file = await fileFromBytes(new Uint8Array(5000), 'scan.png', 'image/png');
    const input = container!.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    const warning = container!.querySelector('.formspec-file-legibility')!;
    const image = container!.querySelector('.formspec-file-redaction-image')!;
    const source = image.getAttribute('src');
    expect(warning.textContent).toBe(UI_STRINGS['fileUpload.legibilityWarning']);
    act(() => {
      engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
        target: { kind: 'definition', url: definitionUrl }, strings: {
          '$ui.fileUpload.legibilityWarning': 'Compruebe que la imagen sea legible.',
          '$ui.fileUpload.previewImage': 'Vista previa antes de subir',
          '$ui.fileUpload.uploadImage': 'Subir imagen',
          '$ui.fileUpload.redactionSurface': 'Dibuje cuadros para ocultar información',
        } });
      engine.setLocale('es');
    });
    expect(warning.textContent).toBe('Compruebe que la imagen sea legible.');
    expect(image.getAttribute('alt')).toBe('Vista previa antes de subir');
    expect(container!.querySelector('.formspec-file-redaction-surface')!.getAttribute('aria-label')).toBe('Dibuje cuadros para ocultar información');
    expect(container!.textContent).toContain('Subir imagen');
    expect(image.getAttribute('src')).toBe(source);
    expect(upload).not.toHaveBeenCalled();
    expect(harness.field.setValue).not.toHaveBeenCalled();
    act(() => engine.setLocale(''));
    expect(warning.textContent).toBe(UI_STRINGS['fileUpload.legibilityWarning']);
  });

  it('emits Component graph metadata on the primary upload control', () => {
    const harness = makeFieldHarness();
    const node = {
      ...makeNode({ dragDrop: true }),
      componentGraphIdentity: {
        component: { handle: 'respondent' },
        surface: { url: 'https://surfaces.example.test/intake' },
        route: 'apply',
        nodePath: '/root/supportingDocument',
        id: 'supporting-document-node',
      },
    } as LayoutNode;
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={harness.field} node={node} />
      </AttachmentStoreProvider>,
    );

    const dropZone = container!.querySelector('.formspec-file-drop-zone') as HTMLElement;
    expect(dropZone.dataset.formspecComponentHandle).toBe('respondent');
    expect(dropZone.dataset.formspecRoute).toBe('apply');
    expect(dropZone.dataset.formspecNodePath).toBe('/root/supportingDocument');
    expect(dropZone.dataset.formspecComponentNodeId).toBe('supporting-document-node');
  });

  it('labels the native picker and keeps focusable controls out of button semantics', () => {
    const harness = makeFieldHarness();
    render(
      <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl
          field={harness.field}
          node={makeNode({ dragDrop: true })}
        />
      </AttachmentStoreProvider>,
    );

    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    const label = container!.querySelector(`label[for="${input.id}"]`);
    const dropZone = container!.querySelector('.formspec-file-drop-zone');
    expect(label?.textContent).toContain('Lease');
    expect(dropZone?.getAttribute('role')).toBe('group');
    expect(dropZone?.hasAttribute('tabindex')).toBe(false);
    expect(dropZone?.getAttribute('aria-labelledby')).toBe(`${input.id}-label`);
  });

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
    const write = harness.nextWrite();
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await write;
    });

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
    const write = harness.nextWrite();
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await write;
    });

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

  it('accepts the exact advertised store cap and rejects cap plus one before direct upload', async () => {
    const upload = vi.fn(stubAttachmentStore().upload);
    const harness = makeFieldHarness();
    render(<AttachmentStoreProvider value={{ upload, maxUploadBytes: 1024 }}>
      <FormspecWebAttachmentControl field={harness.field} node={makeNode()} />
    </AttachmentStoreProvider>);
    const input = container!.querySelector('input[type="file"]')!;
    const exact = await fileFromBytes(new Uint8Array(1024), 'exact.pdf');
    Object.defineProperty(input, 'files', { value: [exact], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0].size).toBe(1024);
    Object.defineProperty(input, 'files', { value: [await fileFromBytes(new Uint8Array(1025), 'over.pdf')], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain('1.0 KiB');
  });

  it('keeps a stricter Theme maximum below the advertised store cap', async () => {
    const upload = vi.fn(stubAttachmentStore().upload);
    const node = { ...makeNode(), presentation: { widgetConfig: { maxSizeMb: 1 } } } as LayoutNode;
    render(<AttachmentStoreProvider value={{ upload, maxUploadBytes: 2 * 1024 * 1024 }}>
      <FormspecWebAttachmentControl field={makeFieldHarness().field} node={node} />
    </AttachmentStoreProvider>);
    const input = container!.querySelector('input[type="file"]')!;
    const file = await fileFromBytes(new Uint8Array(1), 'over-theme.pdf');
    Object.defineProperty(file, 'size', { value: 1024 * 1024 + 1 });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    expect(upload).not.toHaveBeenCalled();
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain('1.0 MiB');
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

  it('uses resolved Theme upload config and preserves explicit Component overrides', async () => {
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    const themedNode = { ...makeNode(), presentation: { widgetConfig: { accept: 'image/png', multiple: true, maxSizeMb: 1 } } } as LayoutNode;
    render(<AttachmentStoreProvider value={store}><FormspecWebAttachmentControl field={harness.field} node={themedNode} /></AttachmentStoreProvider>);
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png');
    expect(input.multiple).toBe(true);
    const txt = await fileFromBytes(new Uint8Array([1]), 'note.txt', 'text/plain');
    Object.defineProperty(input, 'files', { value: [txt], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    expect(container?.textContent).toContain('file type is not accepted');
    expect(harness.readValue()).toBeNull();
    render(<AttachmentStoreProvider value={store}><FormspecWebAttachmentControl field={harness.field} node={{ ...themedNode, props: { accept: 'application/pdf', multiple: false } }} /></AttachmentStoreProvider>);
    const override = container!.querySelector('input[type="file"]') as HTMLInputElement;
    expect(override.accept).toBe('application/pdf');
    expect(override.multiple).toBe(false);
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

  it('opens image review for a file that matches `accept` under StrictMode before upload', async () => {
    stubLoadedImage();
    const store = stubAttachmentStore();
    const harness = makeFieldHarness();
    render(
      <StrictMode><AttachmentStoreProvider value={store}>
        <FormspecWebAttachmentControl
          field={harness.field}
          node={makeNode({ accept: 'image/*' })}
        />
      </AttachmentStoreProvider></StrictMode>,
    );

    const png = await fileFromBytes(new Uint8Array([1]), 'photo.png', 'image/png');
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [png], configurable: true });
    // Pick → review settles on microtasks (Image stub, legibility analysis), which act drains.
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const uploadBtn = Array.from(container!.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Upload image');
    expect(uploadBtn).toBeDefined();
    expect(harness.readValue()).toBeNull();
    const write = harness.nextWrite();
    await act(async () => {
      uploadBtn!.click();
      await write;
    });

    expect(harness.readValue()).toMatchObject({ kind: 'attachment-ref', filename: 'photo.png' });
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

    expect(container?.textContent ?? '').toContain(UI_STRINGS['fileUpload.legibilityWarning']);
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

  it('refuses crop output that grows beyond the store cap and retains the original review image', async () => {
    stubLoadedImage({ width: 10, height: 10 });
    const pixels = new Uint8ClampedArray(10 * 10 * 4).fill(255);
    for (const offset of [(2 * 10 + 2) * 4, (7 * 10 + 7) * 4]) pixels.fill(0, offset, offset + 3);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(), getImageData: () => ({ data: pixels }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['big'], { type: 'image/png' })));
    const upload = vi.fn(stubAttachmentStore().upload);
    render(<AttachmentStoreProvider value={{ upload, maxUploadBytes: 2 }}>
      <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode({ accept: 'image/*' })} />
    </AttachmentStoreProvider>);
    const input = container!.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [await fileFromBytes(new Uint8Array(1), 'scan.png', 'image/png')], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    const originalSource = container!.querySelector('img')!.getAttribute('src');
    const crop = Array.from(container!.querySelectorAll('button')).find(button => button.textContent === 'Detect page edges')!;
    await act(async () => { crop.click(); await flush(); });
    expect(container!.querySelector('.formspec-file-pending-status')!.textContent).toContain('upload limit of 2 B');
    expect(container!.querySelector('img')!.getAttribute('src')).toBe(originalSource);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects an original above a newly reduced store cap before a potentially smaller redaction', async () => {
    stubLoadedImage();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['x'], { type: 'image/png' })));
    const upload = vi.fn(stubAttachmentStore().upload);
    const harness = makeFieldHarness();
    const control = (cap: number) => <AttachmentStoreProvider value={{ upload, maxUploadBytes: cap }}>
      <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*' })} />
    </AttachmentStoreProvider>;
    render(control(4));
    const input = container!.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [await fileFromBytes(new Uint8Array(3), 'scan.png', 'image/png')], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    act(() => root?.render(control(2)));
    const button = (text: string) => Array.from(container!.querySelectorAll('button')).find(candidate => candidate.textContent === text)!;
    act(() => button('Add redaction box').click());
    await act(async () => { button('Upload image').click(); await flush(); });
    expect(container!.querySelector('.formspec-file-pending-status')!.textContent).toContain('upload limit of 2 B');
    expect(toBlob).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(harness.readValue()).toBeNull();
  });

  it('rejects final camera bytes above the advertised store cap before image review or upload', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(96 * 96 * 4) }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob([new Uint8Array(1025)], { type: 'image/jpeg' })));
    const upload = vi.fn(stubAttachmentStore().upload);
    try {
      render(<AttachmentStoreProvider value={{ upload, maxUploadBytes: 1024 }}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode({ accept: 'image/*' })} />
      </AttachmentStoreProvider>);
      const button = (text: string) => Array.from(container!.querySelectorAll('button')).find(candidate => candidate.textContent === text)!;
      await act(async () => { button('Use camera').click(); await flush(); });
      await act(async () => { button('Capture image').click(); await flush(); });
      expect(container!.querySelector('.formspec-file-pending-status')!.textContent).toContain('upload limit of 1.0 KiB');
      expect(container!.querySelector('.formspec-file-image-review')).toBeNull();
      expect(upload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
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
      <AttachmentStoreProvider value={{ upload: uploadSpy, maxUploadBytes: 2 }}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ accept: 'image/*' })} />
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

  it.each([false, true])('returns focused error dismissal to the chooser and supports retry (dragDrop=%s)', async (dragDrop) => {
    const upload = vi.fn(stubAttachmentStore().upload);
    render(<AttachmentStoreProvider value={{ upload }}>
      <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode({ dragDrop, maxSize: 1 })} />
    </AttachmentStoreProvider>);
    const chooser = container!.querySelector('.formspec-file-browse-btn') as HTMLButtonElement;
    const input = container!.querySelector('input[type="file"]')!;
    const file = await fileFromBytes(new Uint8Array(2), 'too-large.pdf');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
      const dismiss = container!.querySelector('.formspec-file-pending-dismiss') as HTMLButtonElement;
      dismiss.focus();
      expect(document.activeElement).toBe(dismiss);
      act(() => dismiss.click());
      expect(dismiss.isConnected).toBe(false);
      expect(document.activeElement).toBe(chooser);
      expect(container!.querySelector('.formspec-file-pending')).toBeNull();
    }
    expect(upload).not.toHaveBeenCalled();
  });

  it('uses visible camera and named field fallbacks when the error chooser is unavailable', async () => {
    const harness = makeFieldHarness();
    const draw = () => {
      const control = <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ maxSize: 1 })} />
      </AttachmentStoreProvider>;
      if (root) act(() => root?.render(control));
      else render(control);
    };
    draw();
    const file = await fileFromBytes(new Uint8Array(2), 'too-large.pdf');
    const input = container!.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    (container!.querySelector('.formspec-file-browse-btn') as HTMLElement).style.display = 'none';
    const camera = Array.from(container!.querySelectorAll('button')).find(button => button.textContent === 'Use camera')!;
    let dismiss = container!.querySelector('.formspec-file-pending-dismiss') as HTMLButtonElement;
    dismiss.focus();
    act(() => dismiss.click());
    expect(document.activeElement).toBe(camera);
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    harness.field.readonly = true;
    draw();
    dismiss = container!.querySelector('.formspec-file-pending-dismiss') as HTMLButtonElement;
    dismiss.focus();
    act(() => dismiss.click());
    expect(document.activeElement).toBe(container!.querySelector('.formspec-field'));
  });

  it('does not move external focus when an error is dismissed without owning focus', async () => {
    render(<AttachmentStoreProvider value={stubAttachmentStore()}>
      <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode({ maxSize: 1 })} />
    </AttachmentStoreProvider>);
    const input = container!.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [await fileFromBytes(new Uint8Array(2), 'too-large.pdf')], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    try {
      elsewhere.focus();
      act(() => (container!.querySelector('.formspec-file-pending-dismiss') as HTMLButtonElement).click());
      expect(container!.querySelector('.formspec-file-pending')).toBeNull();
      expect(document.activeElement).toBe(elsewhere);
    } finally {
      elsewhere.remove();
    }
  });

  // DOM tests assert the focus lifecycle after native-button activation; the
  // browser checkpoint verifies actual Tab/Enter default activation separately.
  it.each([false, true])('returns focused camera cancellation to its trigger (dragDrop=%s)', async (dragDrop) => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    try {
      render(<AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode({ dragDrop })} />
      </AttachmentStoreProvider>);
      const camera = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent === 'Use camera')!;
      camera.focus();
      await act(async () => { camera.click(); await flush(); });
      const close = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent === 'Close camera')!;
      close.focus();
      expect(document.activeElement).toBe(close);
      act(() => close.click());
      expect(document.activeElement).toBe(camera);
      expect(close.isConnected).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
  });

  it('returns focus after camera permission failure and a second opening', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    try {
      render(<AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode()} />
      </AttachmentStoreProvider>);
      const camera = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent === 'Use camera')!;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        camera.focus();
        await act(async () => { camera.click(); await flush(); });
        expect(container!.querySelector('[role="alert"]')?.textContent).toContain('could not open the camera');
        const close = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent === 'Close camera')!;
        close.focus();
        act(() => close.click());
        expect(document.activeElement).toBe(camera);
      }
      expect(getUserMedia).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
  });

  it('uses the current visible trigger after the opening layout changes, then the field when actions are disabled', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const harness = makeFieldHarness();
    const draw = (dragDrop: boolean) => {
      const control = <AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={harness.field} node={makeNode({ dragDrop })} />
      </AttachmentStoreProvider>;
      if (root) act(() => root?.render(control));
      else render(control);
    };
    const button = (text: string) => Array.from(container!.querySelectorAll('button')).find((candidate) => candidate.textContent === text)!;
    try {
      draw(false);
      const original = button('Use camera');
      original.focus();
      await act(async () => { original.click(); await flush(); });
      draw(true);
      expect(original.isConnected).toBe(false);
      button('Close camera').focus();
      act(() => button('Close camera').click());
      expect(document.activeElement).toBe(button('Use camera'));
      await act(async () => { button('Use camera').click(); await flush(); });
      button('Use camera').style.display = 'none';
      button('Close camera').focus();
      act(() => button('Close camera').click());
      expect(document.activeElement).toBe(button('Upload a file'));
      button('Use camera').style.display = '';
      await act(async () => { button('Use camera').click(); await flush(); });
      harness.field.readonly = true;
      draw(true);
      button('Close camera').focus();
      act(() => button('Close camera').click());
      expect(document.activeElement).toBe(container!.querySelector('.formspec-field'));
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
  });

  it('keeps returned focus and stops a stream that arrives after camera cancellation', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    let resolveStream: (stream: MediaStream) => void = () => {};
    const streamPromise = new Promise<MediaStream>((resolve) => { resolveStream = resolve; });
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => streamPromise) }, configurable: true,
    });
    try {
      render(<AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode()} />
      </AttachmentStoreProvider>);
      const button = (text: string) => Array.from(container!.querySelectorAll('button')).find((candidate) => candidate.textContent === text)!;
      const camera = button('Use camera');
      await act(async () => { camera.click(); await flush(); });
      button('Close camera').focus();
      act(() => button('Close camera').click());
      await act(async () => { resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream); await flush(); });
      expect(stop).toHaveBeenCalledTimes(1);
      expect(container!.querySelector('.formspec-file-camera')).toBeNull();
      expect(document.activeElement).toBe(camera);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
  });

  it('leaves focus outside the camera alone when an asynchronous capture completes', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(96 * 96 * 4) }),
    } as unknown as CanvasRenderingContext2D);
    let finishCapture: BlobCallback = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => { finishCapture = callback; });
    const elsewhere = document.createElement('button');
    elsewhere.textContent = 'Another action';
    document.body.append(elsewhere);
    try {
      render(<AttachmentStoreProvider value={stubAttachmentStore()}>
        <FormspecWebAttachmentControl field={makeFieldHarness().field} node={makeNode({ accept: 'image/*' })} />
      </AttachmentStoreProvider>);
      const button = (text: string) => Array.from(container!.querySelectorAll('button')).find((candidate) => candidate.textContent === text)!;
      await act(async () => { button('Use camera').click(); await flush(); });
      button('Capture image').focus();
      act(() => button('Capture image').click());
      elsewhere.focus();
      await act(async () => { finishCapture(new Blob(['image'], { type: 'image/jpeg' })); await flush(); });
      expect(container!.querySelector('.formspec-file-camera')).toBeNull();
      expect(container!.textContent).toContain('Upload image');
      expect(document.activeElement).toBe(elsewhere);
    } finally {
      elsewhere.remove();
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
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
    expect(container?.textContent ?? '').toContain(UI_STRINGS['fileUpload.deferredLibrary']);
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
