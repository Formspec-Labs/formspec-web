import type { DraftStore } from '../../ports/draft-store.ts';
import { notForNarrowedRouteError } from './_error.ts';

export function noopDraftStore(routeCite?: string): DraftStore {
  return {
    async load() {
      throw notForNarrowedRouteError('DraftStore', routeCite);
    },
    async save() {
      throw notForNarrowedRouteError('DraftStore', routeCite);
    },
    async list() {
      throw notForNarrowedRouteError('DraftStore', routeCite);
    },
    async delete() {
      throw notForNarrowedRouteError('DraftStore', routeCite);
    },
    async invalidateSubject() {
      throw notForNarrowedRouteError('DraftStore', routeCite);
    },
  };
}
