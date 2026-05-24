/**
 * FormspecWebAttachmentControl — the formspec-web override for the FormspecNode
 * `FileUpload` field component.
 *
 * Wraps the raw file-picker UX so the bytes flow through the
 * AttachmentStore port instead of staying in-process as `File` objects (which
 * JSON-roundtrip to `{}` and silently disappear at submit). The engine value
 * at an attachment-typed field becomes a serializable AttachmentRef (or
 * AttachmentRef[] in `multiple` mode); the submit handoff carries it through
 * `response.data` unchanged.
 *
 * Vocabulary firewall: nothing visible in the DOM names the AttachmentRef
 * shape, the URI, the hash, the MIME type literally, or the port. Respondent
 * sees "file", "upload", "remove".
 */
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import type { FieldComponentProps } from '@formspec-org/react';
import {
  AttachmentUploadError,
  type AttachmentRef,
  type AttachmentStore,
  type AttachmentUploadErrorCode,
} from '../ports/attachment-store.ts';
import { useAttachmentStore } from './AttachmentStoreProvider.tsx';

/** Honest deferred-capability copy — fixture-pinned per FW-0033 §"Vocabulary firewall". */
export const ATTACHMENT_DEFERRED_CAPABILITY_COPY =
  'Camera capture, edge detection, on-device redaction, and saving to your document library are not yet available here.';

const ATTACHMENT_UPLOAD_FAILURE_COPY = 'We could not upload your file. Try again.';

/**
 * L-2: tab-killer guard. 25 MiB is large enough for typical attachment use
 * (passport scans, lease documents, multi-page PDFs) and small enough that an
 * accidental 10 GB drop won't OOM the browser tab. Adopters override per-field
 * via `props.maxSize` (bytes). Documented in docs/ports/attachment-store.md.
 */
export const ATTACHMENT_DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

type RowStatus =
  | { kind: 'uploading'; key: string; filename: string }
  | { kind: 'failed'; key: string; filename: string; message: string };

function asArray(value: unknown): AttachmentRef[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter(isAttachmentRefValue);
  }
  if (isAttachmentRefValue(value)) return [value];
  return [];
}

function isAttachmentRefValue(value: unknown): value is AttachmentRef {
  return !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'attachment-ref';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FormspecWebAttachmentControl({ field, node }: FieldComponentProps) {
  const attachmentStore = useAttachmentStore();
  const accept = (node.props?.accept as string | undefined) ?? undefined;
  const multiple = node.props?.multiple === true;
  const dragDrop = node.props?.dragDrop !== false;
  // L-2: default tab-killer guard. Adopters override per-field via props.maxSize.
  const maxSize = typeof node.props?.maxSize === 'number'
    ? node.props.maxSize
    : ATTACHMENT_DEFAULT_MAX_SIZE_BYTES;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<RowStatus[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const refs = asArray(field.value);
  // H-1 closure-stale race fix: every read of "what's currently in the field"
  // inside async post-settle paths must walk through this ref, NOT the
  // closure-captured `refs` array. If the user removes an existing ref while
  // an upload is in flight, `field.value` updates synchronously but the
  // handler's closure does not — without this ref, the post-settle write
  // would reintroduce the removed value.
  const fieldValueRef = useRef<unknown>(field.value);
  fieldValueRef.current = field.value;

  const writeBack = useCallback(
    (next: AttachmentRef[]): void => {
      if (multiple) {
        field.setValue(next);
      } else {
        field.setValue(next[0] ?? null);
      }
    },
    [field, multiple],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const sizeViolation = files.find((file) => file.size > maxSize);
      if (sizeViolation) {
        const key = `size-${Date.now()}-${sizeViolation.name}`;
        setPending((prev) => [
          ...prev,
          {
            kind: 'failed',
            key,
            filename: sizeViolation.name,
            message: `"${sizeViolation.name}" is larger than the upload limit of ${formatSize(maxSize)}.`,
          },
        ]);
        return;
      }

      // L-2: client-side accept enforcement. If the field declares accept and
      // a dropped/picked file doesn't match by extension or MIME, reject with
      // a typed AttachmentUploadError so the code-keyed copy renders.
      if (accept) {
        const mimeViolation = files.find((file) => !matchesAccept(file, accept));
        if (mimeViolation) {
          const key = `mime-${Date.now()}-${mimeViolation.name}`;
          setPending((prev) => [
            ...prev,
            {
              kind: 'failed',
              key,
              filename: mimeViolation.name,
              message: failureMessage(
                new AttachmentUploadError('File type not accepted', { code: 'mime-rejected' }),
              ),
            },
          ]);
          return;
        }
      }

      const incoming = multiple ? files : files.slice(0, 1);
      const startedAt = Date.now();
      const seedRows = incoming.map((file, index): RowStatus => ({
        kind: 'uploading',
        key: `up-${startedAt}-${index}-${file.name}`,
        filename: file.name,
      }));
      setPending((prev) => [...prev, ...seedRows]);

      const uploaded = await Promise.allSettled(
        incoming.map(async (file, index) =>
          uploadOne(attachmentStore, file, seedRows[index].key),
        ),
      );

      // H-1: read field.value FRESH at settlement time via fieldValueRef.
      // Concurrent removes during the in-flight upload update field.value
      // synchronously; reading the closure-captured `refs` would resurrect a
      // ref the user just removed.
      const liveRefs = asArray(fieldValueRef.current);
      let nextRefs: AttachmentRef[] = multiple ? [...liveRefs] : [];
      const finalRows: RowStatus[] = [];
      for (let index = 0; index < uploaded.length; index += 1) {
        const outcome = uploaded[index];
        const seed = seedRows[index];
        if (outcome.status === 'fulfilled') {
          nextRefs = multiple ? [...nextRefs, outcome.value] : [outcome.value];
        } else {
          finalRows.push({
            kind: 'failed',
            key: seed.key,
            filename: seed.filename,
            message: failureMessage(outcome.reason),
          });
        }
      }
      setPending((prev) => [
        ...prev.filter((row) => !seedRows.some((seed) => seed.key === row.key)),
        ...finalRows,
      ]);
      writeBack(nextRefs);
    },
    [attachmentStore, accept, maxSize, multiple, writeBack],
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    void handleFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragOver(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (field.readonly) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const removeAt = (uri: string): void => {
    field.touch();
    // Read FRESH field state — the rendered closure may be stale relative to a
    // just-settled upload that wrote new refs (mirror of the H-1 fix).
    const liveRefs = asArray(fieldValueRef.current);
    writeBack(liveRefs.filter((ref) => ref.uri !== uri));
    // M-2: best-effort lifecycle hook. Adopters who don't implement `delete`
    // are responsible for submit-side cleanup via response-data diff (see
    // docs/ports/attachment-store.md). A failed delete must not block the
    // respondent — swallow + log.
    if (typeof attachmentStore.delete === 'function') {
      void attachmentStore.delete(uri).catch((err: unknown) => {
        console.debug('AttachmentStore.delete failed (non-blocking)', err);
      });
    }
  };

  const dismissPending = (key: string): void => {
    setPending((prev) => prev.filter((row) => row.key !== key));
  };

  const hiddenInput = (
    <input
      ref={fileInputRef}
      id={field.id}
      name={field.path}
      type="file"
      className="formspec-file-input-hidden"
      disabled={field.readonly}
      accept={accept}
      multiple={multiple}
      aria-invalid={!!(field.error && field.touched)}
      aria-required={field.required}
      onChange={handleInputChange}
    />
  );

  const refList = refs.length > 0 ? (
    <ul className="formspec-file-list" aria-label="Files you have attached">
      {refs.map((ref) => (
        <li key={ref.uri} className="formspec-file-list-item">
          <span className="formspec-file-list-name">{ref.filename}</span>
          <span className="formspec-file-list-size">{formatSize(ref.size)}</span>
          {!field.readonly ? (
            <button
              type="button"
              className="formspec-file-list-remove"
              aria-label={`Remove ${ref.filename}`}
              onClick={() => removeAt(ref.uri)}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  ) : null;

  const pendingList = pending.length > 0 ? (
    <ul className="formspec-file-pending" aria-label="Pending file activity">
      {pending.map((row) => (
        <li key={row.key} className={`formspec-file-pending-item formspec-file-pending-${row.kind}`}>
          <span className="formspec-file-pending-name">{row.filename}</span>
          {row.kind === 'uploading' ? (
            <span className="formspec-file-pending-status" role="status">Uploading…</span>
          ) : (
            <>
              <span className="formspec-file-pending-status formspec-error" role="alert">{row.message}</span>
              <button
                type="button"
                className="formspec-file-pending-dismiss"
                aria-label={`Dismiss error for ${row.filename}`}
                onClick={() => dismissPending(row.key)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  ) : null;

  const deferredCopy = (
    <p className="formspec-file-deferred">{ATTACHMENT_DEFERRED_CAPABILITY_COPY}</p>
  );

  if (!dragDrop) {
    return (
      <>
        {hiddenInput}
        <button
          type="button"
          className="formspec-file-browse-btn formspec-focus-ring formspec-button-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={field.readonly}
        >
          Choose file{multiple ? 's' : ''}
        </button>
        {refList}
        {pendingList}
        {deferredCopy}
      </>
    );
  }

  return (
    <>
      <div
        className={`formspec-file-drop-zone formspec-focus-ring${isDragOver ? ' formspec-file-drop-zone--active' : ''}`}
        tabIndex={field.readonly ? -1 : 0}
        role="button"
        aria-label="Drop files here or click to choose"
        onKeyDown={handleKey}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="formspec-file-drop-content">
          <span className="formspec-file-drop-icon" aria-hidden="true">{'⇵'}</span>
          <span className="formspec-file-drop-label">
            {refs.length === 0
              ? multiple
                ? 'Drag and drop files here'
                : 'Drag and drop a file here'
              : `${refs.length} file${refs.length !== 1 ? 's' : ''} attached`}
          </span>
          <button
            type="button"
            className="formspec-file-browse-btn formspec-focus-ring formspec-button-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={field.readonly}
          >
            Choose file{multiple ? 's' : ''}
          </button>
        </div>
      </div>
      {hiddenInput}
      {refList}
      {pendingList}
      {deferredCopy}
    </>
  );
}

async function uploadOne(
  store: AttachmentStore,
  file: File,
  _rowKey: string,
): Promise<AttachmentRef> {
  return store.upload(file, {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
  });
}

/**
 * Vocabulary firewall: respondent-facing copy keyed on the typed code, not on
 * adopter-supplied prose. Adopter `error.message` may include adopter
 * vocabulary (URLs, host names, request IDs) — the renderer keeps the user
 * surface plain-language and uses `error.message` only as a debug fallback
 * for the `unknown` code where the adopter is the only sane source of detail.
 */
const ATTACHMENT_UPLOAD_FAILURE_COPY_BY_CODE: Record<AttachmentUploadErrorCode, string> = {
  'file-too-large': 'That file is larger than the upload limit. Try a smaller file.',
  'mime-rejected': 'That file type is not accepted here.',
  network: 'We could not reach the upload service. Check your connection and try again.',
  unavailable: 'File upload is not available on this site.',
  unknown: ATTACHMENT_UPLOAD_FAILURE_COPY,
};

function failureMessage(reason: unknown): string {
  if (reason instanceof AttachmentUploadError) {
    return ATTACHMENT_UPLOAD_FAILURE_COPY_BY_CODE[reason.code] ?? ATTACHMENT_UPLOAD_FAILURE_COPY;
  }
  return ATTACHMENT_UPLOAD_FAILURE_COPY;
}

/**
 * Mirrors the HTML5 `<input accept>` matching rules adopters expect:
 * - `.ext` matches by file extension (case-insensitive).
 * - `mime/type` matches the exact File.type.
 * - `mime/*` matches any MIME with that prefix (e.g., `image/*`).
 * - Empty or missing accept matches everything (caller guards on `accept`
 *   being truthy before calling).
 */
function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const lowerName = file.name.toLowerCase();
  const lowerType = (file.type || '').toLowerCase();
  for (const token of tokens) {
    if (token.startsWith('.')) {
      if (lowerName.endsWith(token)) return true;
      continue;
    }
    if (token.endsWith('/*')) {
      const prefix = token.slice(0, token.length - 1); // keep trailing slash
      if (lowerType.startsWith(prefix)) return true;
      continue;
    }
    if (lowerType === token) return true;
  }
  return false;
}
