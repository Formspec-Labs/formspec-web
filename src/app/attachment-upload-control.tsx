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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { FieldComponentProps } from '@formspec-org/react';
import {
  AttachmentUploadError,
  type AttachmentRef,
  type AttachmentStore,
  type AttachmentUploadErrorCode,
  isResumableAttachmentStore,
} from '../ports/attachment-store.ts';
import { useAttachmentStore } from './AttachmentStoreProvider.tsx';

/** Honest deferred-capability copy — fixture-pinned per FW-0033 §"Vocabulary firewall". */
export const ATTACHMENT_DEFERRED_CAPABILITY_COPY =
  'Saving to your document library is not yet available here.';

export const ATTACHMENT_LEGIBILITY_WARNING_COPY =
  'This image may be hard to read. Check focus, lighting, and glare before uploading.';

const ATTACHMENT_UPLOAD_FAILURE_COPY = 'We could not upload your file. Try again.';

/**
 * L-2: tab-killer guard. 25 MiB is large enough for typical attachment use
 * (passport scans, lease documents, multi-page PDFs) and small enough that an
 * accidental 10 GB drop won't OOM the browser tab. Adopters override per-field
 * via `props.maxSize` (bytes). Documented in docs/ports/attachment-store.md.
 */
export const ATTACHMENT_DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

type RowStatus =
  | { kind: 'uploading'; key: string; filename: string; progressPercent?: number }
  | { kind: 'failed'; key: string; filename: string; message: string };

interface RedactionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ImageDraft {
  readonly file: File;
  readonly objectUrl: string;
  readonly redactions: RedactionRect[];
  readonly legibilityWarning?: string;
}

interface FileValidationFailure {
  readonly file: File;
  readonly message: string;
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const imageDraftRef = useRef<ImageDraft | null>(null);
  const imageDraftQueueRef = useRef<ImageDraft[]>([]);
  const redactionSurfaceRef = useRef<HTMLDivElement>(null);
  const redactionStartRef = useRef<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<RowStatus[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState<ImageDraft | null>(null);
  const [imageDraftQueue, setImageDraftQueue] = useState<ImageDraft[]>([]);
  const [activeRedaction, setActiveRedaction] = useState<RedactionRect | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cameraRequestIdRef.current += 1;
      stopCamera(cameraStreamRef.current);
      cameraStreamRef.current = null;
      if (imageDraftRef.current) URL.revokeObjectURL(imageDraftRef.current.objectUrl);
      for (const draft of imageDraftQueueRef.current) {
        URL.revokeObjectURL(draft.objectUrl);
      }
    };
  }, []);

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

  const addFailedRows = useCallback((failures: readonly FileValidationFailure[]): void => {
    if (failures.length === 0) return;
    const failedAt = Date.now();
    setPending((prev) => [
      ...prev,
      ...failures.map((failure, index): RowStatus => ({
        kind: 'failed',
        key: `validation-${failedAt}-${index}-${failure.file.name}`,
        filename: failure.file.name,
        message: failure.message,
      })),
    ]);
  }, []);

  const validateFile = useCallback(
    (file: File): string | undefined => {
      if (file.size > maxSize) {
        return `"${file.name}" is larger than the upload limit of ${formatSize(maxSize)}.`;
      }
      if (accept && !matchesAccept(file, accept)) {
        return failureMessage(new AttachmentUploadError('File type not accepted', { code: 'mime-rejected' }));
      }
      return undefined;
    },
    [accept, maxSize],
  );

  const replaceImageDraft = useCallback((next: ImageDraft | null): void => {
    const previous = imageDraftRef.current;
    if (previous && previous.objectUrl !== next?.objectUrl) {
      URL.revokeObjectURL(previous.objectUrl);
    }
    imageDraftRef.current = next;
    setImageDraft(next);
    setActiveRedaction(null);
    redactionStartRef.current = null;
  }, []);

  const replaceImageDraftQueue = useCallback((next: ImageDraft[]): void => {
    imageDraftQueueRef.current = next;
    setImageDraftQueue(next);
  }, []);

  const advanceImageDraftQueue = useCallback((): void => {
    const [next, ...rest] = imageDraftQueueRef.current;
    replaceImageDraftQueue(rest);
    replaceImageDraft(next ?? null);
  }, [replaceImageDraft, replaceImageDraftQueue]);

  const enqueueImageDrafts = useCallback((files: readonly File[]): void => {
    if (files.length === 0) return;
    const drafts = files.map((file): ImageDraft => ({
      file,
      objectUrl: URL.createObjectURL(file),
      redactions: [],
      legibilityWarning: estimateLegibilityWarning(file),
    }));
    if (!imageDraftRef.current) {
      const [first, ...rest] = drafts;
      replaceImageDraft(first ?? null);
      replaceImageDraftQueue([...imageDraftQueueRef.current, ...rest]);
      return;
    }
    replaceImageDraftQueue([...imageDraftQueueRef.current, ...drafts]);
  }, [replaceImageDraft, replaceImageDraftQueue]);

  const startUploads = useCallback(
    async (incoming: File[]) => {
      const startedAt = Date.now();
      const seedRows = incoming.map((file, index): RowStatus => ({
        kind: 'uploading',
        key: `up-${startedAt}-${index}-${file.name}`,
        filename: file.name,
      }));
      setPending((prev) => [...prev, ...seedRows]);

      const uploaded = await Promise.allSettled(
        incoming.map(async (file, index) =>
          uploadOne(attachmentStore, file, (progressPercent) => {
            setPending((prev) =>
              prev.map((row) =>
                row.key === seedRows[index].key && row.kind === 'uploading'
                  ? { ...row, progressPercent }
                  : row,
              ),
            );
          }),
        ),
      );

      // H-1: read field.value FRESH at settlement time via fieldValueRef.
      // Concurrent removes during the in-flight upload update field.value
      // synchronously; reading the closure-captured `refs` would resurrect a
      // ref the user just removed.
      const liveRefs = asArray(fieldValueRef.current);
      let nextRefs: AttachmentRef[] = multiple ? [...liveRefs] : liveRefs.slice(0, 1);
      let hasSuccessfulUpload = false;
      const finalRows: RowStatus[] = [];
      for (let index = 0; index < uploaded.length; index += 1) {
        const outcome = uploaded[index];
        const seed = seedRows[index];
        if (outcome.status === 'fulfilled') {
          hasSuccessfulUpload = true;
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
      if (hasSuccessfulUpload) {
        writeBack(nextRefs);
      }
    },
    [attachmentStore, multiple, writeBack],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (field.readonly) return;
      if (files.length === 0) return;

      const incoming = multiple ? files : files.slice(0, 1);
      const failures: FileValidationFailure[] = [];
      if (!multiple && files.length > 1) {
        failures.push(
          ...files.slice(1).map((file): FileValidationFailure => ({
            file,
            message: 'Only one file can be uploaded here.',
          })),
        );
      }
      const acceptedFiles: File[] = [];
      for (const file of incoming) {
        const validationMessage = validateFile(file);
        if (validationMessage) {
          failures.push({ file, message: validationMessage });
        } else {
          acceptedFiles.push(file);
        }
      }
      addFailedRows(failures);

      const imageFiles = acceptedFiles.filter((file) => file.type.startsWith('image/'));
      const uploadFiles = acceptedFiles.filter((file) => !file.type.startsWith('image/'));
      enqueueImageDrafts(imageFiles);

      if (uploadFiles.length > 0) {
        await startUploads(uploadFiles);
      }
    },
    [addFailedRows, enqueueImageDrafts, field.readonly, multiple, startUploads, validateFile],
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
    if (field.readonly) return;
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

  const openCamera = async (): Promise<void> => {
    if (field.readonly) return;
    const requestId = cameraRequestIdRef.current + 1;
    cameraRequestIdRef.current = requestId;
    stopCamera(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraError(null);
    setCameraOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
        stopCamera(stream);
        return;
      }
      cameraStreamRef.current = stream;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (!mountedRef.current || cameraRequestIdRef.current !== requestId || cameraStreamRef.current !== stream) {
        stopCamera(stream);
        if (cameraStreamRef.current === stream) cameraStreamRef.current = null;
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      if (!mountedRef.current || cameraRequestIdRef.current !== requestId) return;
      setCameraError('We could not open the camera. Choose a file instead.');
      setCameraOpen(true);
    }
  };

  const closeCamera = (): void => {
    cameraRequestIdRef.current += 1;
    stopCamera(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraOpen(false);
  };

  const captureImage = async (): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('We could not capture an image. Choose a file instead.');
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const legibilityWarning = analyzeLegibility(context, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
    const validationMessage = validateFile(file);
    if (validationMessage) {
      addFailedRows([{ file, message: validationMessage }]);
      closeCamera();
      return;
    }
    replaceImageDraft({
      file,
      objectUrl: URL.createObjectURL(file),
      redactions: [],
      legibilityWarning,
    });
    closeCamera();
  };

  const redactionPoint = (event: PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = redactionSurfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const beginRedaction = (event: PointerEvent<HTMLDivElement>): void => {
    if (!imageDraft || field.readonly) return;
    const point = redactionPoint(event);
    redactionStartRef.current = point;
    setActiveRedaction({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateRedaction = (event: PointerEvent<HTMLDivElement>): void => {
    const start = redactionStartRef.current;
    if (!start) return;
    const point = redactionPoint(event);
    setActiveRedaction(normalizeRect(start, point));
  };

  const finishRedaction = (event: PointerEvent<HTMLDivElement>): void => {
    const start = redactionStartRef.current;
    if (!start || !imageDraft) return;
    const rect = normalizeRect(start, redactionPoint(event));
    redactionStartRef.current = null;
    setActiveRedaction(null);
    if (rect.width < 0.01 || rect.height < 0.01) return;
    replaceImageDraft({ ...imageDraft, redactions: [...imageDraft.redactions, rect] });
  };

  const uploadImageDraft = async (): Promise<void> => {
    if (!imageDraft) return;
    const draft = imageDraft;
    try {
      const file = draft.redactions.length > 0
        ? await redactImageFile(draft.file, draft.redactions)
        : draft.file;
      const validationMessage = validateFile(file);
      if (validationMessage) {
        addFailedRows([{ file, message: validationMessage }]);
        advanceImageDraftQueue();
        return;
      }
      advanceImageDraftQueue();
      await startUploads([file]);
    } catch {
      setPending((prev) => [
        ...prev,
        {
          kind: 'failed',
          key: `redaction-${Date.now()}`,
          filename: draft.file.name,
          message: 'We could not prepare that image. Choose the file again.',
        },
      ]);
      advanceImageDraftQueue();
    }
  };

  const cancelImageDraft = (): void => {
    advanceImageDraftQueue();
  };

  const deskewImageDraft = async (): Promise<void> => {
    if (!imageDraft) return;
    try {
      const file = await cropToDetectedPageEdges(imageDraft.file);
      const objectUrl = URL.createObjectURL(file);
      replaceImageDraft({
        ...imageDraft,
        file,
        objectUrl,
        legibilityWarning: estimateLegibilityWarning(file),
      });
    } catch {
      setPending((prev) => [
        ...prev,
        {
          kind: 'failed',
          key: `deskew-${Date.now()}`,
          filename: imageDraft.file.name,
          message: 'We could not clean up the image edges. You can still upload it.',
        },
      ]);
    }
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
            <span className="formspec-file-pending-status" role="status">
              {typeof row.progressPercent === 'number'
                ? `Uploading ${row.progressPercent}%`
                : 'Uploading...'}
            </span>
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

  const cameraPanel = cameraOpen ? (
    <div className="formspec-file-camera" aria-label="Camera capture">
      {cameraError ? <p className="formspec-error" role="alert">{cameraError}</p> : null}
      <video
        ref={videoRef}
        className="formspec-file-camera-preview"
        playsInline
        muted
        aria-label="Camera preview"
      />
      <div className="formspec-file-actions">
        <button type="button" className="formspec-button-secondary" onClick={() => void captureImage()}>
          Capture image
        </button>
        <button type="button" className="formspec-button-secondary" onClick={closeCamera}>
          Close camera
        </button>
      </div>
    </div>
  ) : null;

  const redactionRects = imageDraft ? [...imageDraft.redactions, ...(activeRedaction ? [activeRedaction] : [])] : [];
  const imageDraftQueueCopy = imageDraft && imageDraftQueue.length > 0 ? (
    <p className="formspec-file-image-queue" role="status">
      {imageDraftQueue.length} image{imageDraftQueue.length === 1 ? '' : 's'} waiting for review.
    </p>
  ) : null;
  const imageDraftPanel = imageDraft ? (
    <div className="formspec-file-image-review" aria-label="Image review before upload">
      {imageDraft.legibilityWarning ? (
        <p className="formspec-file-legibility" role="alert">{imageDraft.legibilityWarning}</p>
      ) : null}
      {imageDraftQueueCopy}
      <div
        ref={redactionSurfaceRef}
        className="formspec-file-redaction-surface"
        role="application"
        aria-label="Draw boxes over information you want to redact"
        onPointerDown={beginRedaction}
        onPointerMove={updateRedaction}
        onPointerUp={finishRedaction}
      >
        <img src={imageDraft.objectUrl} alt="Preview before upload" className="formspec-file-redaction-image" />
        {redactionRects.map((rect, index) => (
          <span
            key={`${rect.x}-${rect.y}-${rect.width}-${rect.height}-${index}`}
            className="formspec-file-redaction-box"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="formspec-file-actions">
        <button type="button" className="formspec-button-secondary" onClick={() => {
          replaceImageDraft({
            ...imageDraft,
            redactions: [
              ...imageDraft.redactions,
              { x: 0.25, y: 0.25, width: 0.5, height: 0.2 },
            ],
          });
        }}>
          Add redaction box
        </button>
        <button
          type="button"
          className="formspec-button-secondary"
          onClick={() => void deskewImageDraft()}
        >
          Detect page edges
        </button>
        <button
          type="button"
          className="formspec-button-secondary"
          onClick={() => replaceImageDraft({ ...imageDraft, redactions: [] })}
          disabled={imageDraft.redactions.length === 0}
        >
          Clear redactions
        </button>
        <button type="button" className="formspec-button-secondary" onClick={() => void uploadImageDraft()}>
          Upload image
        </button>
        <button type="button" className="formspec-button-secondary" onClick={cancelImageDraft}>
          Cancel
        </button>
      </div>
    </div>
  ) : null;

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
        <button
          type="button"
          className="formspec-button-secondary"
          onClick={() => void openCamera()}
          disabled={field.readonly}
        >
          Use camera
        </button>
        {cameraPanel}
        {imageDraftPanel}
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
          if (field.readonly) return;
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
          <button
            type="button"
            className="formspec-button-secondary"
            onClick={() => void openCamera()}
            disabled={field.readonly}
          >
            Use camera
          </button>
        </div>
      </div>
      {hiddenInput}
      {cameraPanel}
      {imageDraftPanel}
      {refList}
      {pendingList}
      {deferredCopy}
    </>
  );
}

async function uploadOne(
  store: AttachmentStore,
  file: File,
  onProgress: (progressPercent: number) => void,
): Promise<AttachmentRef> {
  if (isResumableAttachmentStore(store)) {
    return store.uploadResumable(file, {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
    }, {
      onProgress: (progress) => {
        const percent = progress.totalBytes === 0
          ? 100
          : Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100));
        onProgress(percent);
      },
    });
  }
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

function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
): RedactionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function estimateLegibilityWarning(file: File): string | undefined {
  if (!file.type.startsWith('image/')) return undefined;
  return file.size < 4096 ? ATTACHMENT_LEGIBILITY_WARNING_COPY : undefined;
}

function analyzeLegibility(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): string | undefined {
  if (width < 900 || height < 600) return ATTACHMENT_LEGIBILITY_WARNING_COPY;
  const sampleWidth = Math.min(width, 96);
  const sampleHeight = Math.min(height, 96);
  const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let min = 255;
  let max = 0;
  let glarePixels = 0;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = Math.round((data[index] + data[index + 1] + data[index + 2]) / 3);
    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
    if (luminance > 245) glarePixels += 1;
  }
  const pixels = data.length / 4;
  if (max - min < 32 || glarePixels / pixels > 0.35) {
    return ATTACHMENT_LEGIBILITY_WARNING_COPY;
  }
  return undefined;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('canvas.toBlob returned null'));
    }, type, quality);
  });
}

async function redactImageFile(file: File, redactions: RedactionRect[]): Promise<File> {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  for (const rect of redactions) {
    context.fillRect(
      Math.round(rect.x * canvas.width),
      Math.round(rect.y * canvas.height),
      Math.round(rect.width * canvas.width),
      Math.round(rect.height * canvas.height),
    );
  }
  const type = file.type || 'image/png';
  const blob = await canvasToBlob(canvas, type, 0.92);
  return new File([blob], file.name, { type, lastModified: Date.now() });
}

async function cropToDetectedPageEdges(file: File): Promise<File> {
  const image = await loadImage(file);
  const source = document.createElement('canvas');
  source.width = image.naturalWidth || image.width;
  source.height = image.naturalHeight || image.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('Canvas unavailable');
  sourceContext.drawImage(image, 0, 0, source.width, source.height);
  const bounds = detectPageBounds(sourceContext, source.width, source.height);
  if (!bounds) return file;

  const output = document.createElement('canvas');
  output.width = bounds.width;
  output.height = bounds.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Canvas unavailable');
  outputContext.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  const type = file.type || 'image/png';
  const blob = await canvasToBlob(output, type, 0.92);
  return new File([blob], file.name, { type, lastModified: Date.now() });
}

function detectPageBounds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luminance = Math.round((data[index] + data[index + 1] + data[index + 2]) / 3);
      if (luminance < 245) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX >= maxX || minY >= maxY) return undefined;
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  if (cropWidth > width * 0.94 && cropHeight > height * 0.94) return undefined;
  return { x: minX, y: minY, width: cropWidth, height: cropHeight };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    image.src = url;
  });
}
