import type { DraftStore } from '../../ports/draft-store.ts';
import { notForStatusRouteError } from './_error.ts';

export function noopDraftStore(): DraftStore {
  return {
    async load() {
      throw notForStatusRouteError('DraftStore');
    },
    async save() {
      throw notForStatusRouteError('DraftStore');
    },
    async list() {
      throw notForStatusRouteError('DraftStore');
    },
    async delete() {
      throw notForStatusRouteError('DraftStore');
    },
    async invalidateSubject() {
      throw notForStatusRouteError('DraftStore');
    },
  };
}
