import { createContext, useContext, type ReactNode } from 'react';
import type { AttachmentStore } from '../ports/attachment-store.ts';

/**
 * Carries the wired AttachmentStore down to FormspecNode field-component
 * overrides. The renderer reaches the store through this context so the
 * override does not need a custom prop spread through the FormspecProvider.
 */
const AttachmentStoreContext = createContext<AttachmentStore | null>(null);

export function AttachmentStoreProvider({
  value,
  children,
}: {
  value: AttachmentStore;
  children: ReactNode;
}) {
  return <AttachmentStoreContext.Provider value={value}>{children}</AttachmentStoreContext.Provider>;
}

export function useAttachmentStore(): AttachmentStore {
  const store = useContext(AttachmentStoreContext);
  if (!store) {
    throw new Error('useAttachmentStore must be called inside an <AttachmentStoreProvider>');
  }
  return store;
}
