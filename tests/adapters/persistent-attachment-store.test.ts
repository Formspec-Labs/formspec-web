import { describe, expect, it, beforeEach } from 'vitest';
import { persistentDemoAttachmentStore } from '../../src/adapters/stub/persistent-attachment-store.ts';
import { sampleAttachmentMetadata } from '../../src/adapter-conformance/fixtures.ts';
import { isDemoStubAdapter } from '../../src/policy/sentinel.ts';

describe('persistentDemoAttachmentStore', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('is marked as a demo-stub adapter', () => {
    expect(isDemoStubAdapter(persistentDemoAttachmentStore({
      namespace: 'test:marker',
      storage,
    }))).toBe(true);
  });

  it('persists bytes across adapter instances with the same namespace', async () => {
    const namespace = 'test:persistent-attachments';
    const first = persistentDemoAttachmentStore({ namespace, storage });
    const ref = await first.upload(new Blob(['hello'], { type: 'text/plain' }), {
      filename: 'hello.txt',
      mimeType: 'text/plain',
    });

    const second = persistentDemoAttachmentStore({ namespace, storage });
    const stored = second.getStoredBytes(ref.uri);
    expect(stored).toBeDefined();
    expect(await stored?.text()).toBe('hello');
  });

  it('ignores malformed persisted entries instead of throwing', () => {
    const namespace = 'test:malformed-persistent-attachments';
    const adapter = persistentDemoAttachmentStore({ namespace, storage });
    const validRef = {
      kind: 'attachment-ref',
      uri: 'attachment:bad-base64',
      hash: 'sha256:00',
      size: 5,
      mimeType: 'text/plain',
      filename: 'bad.txt',
    };

    storage.setItem(`${namespace}:item:attachment:bad-json`, '{not-json');
    storage.setItem(`${namespace}:item:attachment:bad-shape`, JSON.stringify({ bytesBase64: 'aGVsbG8=' }));
    storage.setItem(`${namespace}:item:attachment:bad-base64`, JSON.stringify({
      ref: validRef,
      bytesBase64: '%%%not-base64%%%',
    }));

    expect(adapter.getStoredBytes('attachment:bad-json')).toBeUndefined();
    expect(adapter.getStoredBytes('attachment:bad-shape')).toBeUndefined();
    expect(adapter.getStoredBytes('attachment:bad-base64')).toBeUndefined();
  });

  it('reports byte-level progress through the resumable extension', async () => {
    const adapter = persistentDemoAttachmentStore({
      namespace: 'test:resumable',
      chunkSizeBytes: 2,
      storage,
    });
    const progress: number[] = [];

    await adapter.uploadResumable(new Blob(['abcde'], { type: 'text/plain' }), sampleAttachmentMetadata, {
      onProgress: (event) => progress.push(event.loadedBytes),
    });

    expect(progress).toEqual([2, 4, 5]);
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
