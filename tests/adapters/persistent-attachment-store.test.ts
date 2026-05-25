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
