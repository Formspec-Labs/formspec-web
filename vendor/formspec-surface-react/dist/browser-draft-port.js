/** @filedesc Store preview drafts and revision-matched counts in one IndexedDB transaction. */
import { deriveDraftSubject } from './draft-session.js';
const draftStore = 'editable';
const summaryStore = 'summaries';
function storageKey(key) {
    return [key.scope, key.definitionUrl, key.subject ? 'subject' : 'respondent', key.subject?.id ?? ''];
}
function sectionPlan(sections) {
    return JSON.stringify(sections.map(({ id, fields }) => [id ?? null, fields]));
}
function onRequest(request, read) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            try {
                resolve(read(request.result));
            }
            catch (error) {
                reject(error);
            }
        };
        request.onerror = () => reject(request.error);
    });
}
function requestResult(request) {
    return onRequest(request, value => value);
}
export function createBrowserDraftPort(options = {}) {
    const databaseName = options.databaseName ?? 'formspec-surface-drafts';
    const defaultScope = options.scope ?? 'browser';
    const commits = new EventTarget();
    const channelName = `formspec-drafts:${databaseName}`;
    let channel;
    let subscribers = 0;
    function openChannel() {
        try {
            return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);
        }
        catch {
            return undefined;
        }
    }
    function notify() {
        commits.dispatchEvent(new Event('commit'));
    }
    async function open() {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(draftStore);
            request.result.createObjectStore(summaryStore);
        };
        return requestResult(request);
    }
    async function transaction(stores, mode, work) {
        const db = await open();
        try {
            const tx = db.transaction(stores, mode);
            const finished = new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error ?? new Error('Draft transaction aborted'));
            });
            const result = (async () => work(tx))().catch(error => {
                try {
                    tx.abort();
                }
                catch { /* The transaction already ended. */ }
                throw error;
            });
            const [value] = await Promise.all([result, finished]);
            return value;
        }
        finally {
            db.close();
        }
    }
    async function authorized(key) {
        return options.authorize === undefined || await options.authorize(key);
    }
    function committed() {
        notify();
        const sender = channel ?? openChannel();
        try {
            sender?.postMessage('commit');
        }
        catch {
            // The save already committed. Overview entry still reloads counts.
        }
        finally {
            if (sender !== channel)
                sender?.close();
        }
    }
    return {
        subscribe(listener) {
            const deliver = () => listener();
            commits.addEventListener('commit', deliver);
            if (subscribers++ === 0) {
                channel = openChannel();
                channel?.addEventListener('message', notify);
            }
            let subscribed = true;
            return () => {
                if (!subscribed)
                    return;
                subscribed = false;
                commits.removeEventListener('commit', deliver);
                if (--subscribers === 0) {
                    channel?.close();
                    channel = undefined;
                }
            };
        },
        async load(key, definitionVersion, signal) {
            try {
                signal?.throwIfAborted();
                if (!await authorized(key))
                    return { status: 'denied' };
                signal?.throwIfAborted();
                const draft = await transaction(draftStore, 'readonly', tx => requestResult(tx.objectStore(draftStore).get(storageKey(key))));
                signal?.throwIfAborted();
                if (!draft)
                    return { status: 'absent' };
                if (draft.definitionVersion !== definitionVersion) {
                    return { status: 'version-mismatch', storedVersion: draft.definitionVersion, revision: draft.revision };
                }
                const { revision, snapshotJson, responseJson } = draft;
                return { status: 'loaded', draft: { revision, snapshotJson, responseJson } };
            }
            catch {
                signal?.throwIfAborted();
                return { status: 'unavailable' };
            }
        },
        async save({ key, expectedRevision, definitionVersion, snapshotJson, responseJson, summary }) {
            try {
                if (!await authorized(key))
                    return { status: 'denied' };
                const id = storageKey(key);
                const result = await transaction([draftStore, summaryStore], 'readwrite', tx => {
                    const drafts = tx.objectStore(draftStore);
                    return onRequest(drafts.get(id), (previous) => {
                        if ((previous?.revision ?? null) !== expectedRevision ||
                            (previous && previous.definitionVersion !== definitionVersion))
                            return { status: 'conflict' };
                        const revision = crypto.randomUUID();
                        drafts.put({ revision, definitionVersion, snapshotJson, responseJson }, id);
                        tx.objectStore(summaryStore).put({ revision, definitionVersion, summary }, id);
                        return { status: 'saved', revision };
                    });
                });
                if (result.status === 'saved')
                    committed();
                return result;
            }
            catch {
                return { status: 'unavailable' };
            }
        },
        async restart(key, expectedRevision) {
            try {
                if (!await authorized(key))
                    return { status: 'denied' };
                const id = storageKey(key);
                const result = await transaction([draftStore, summaryStore], 'readwrite', tx => {
                    const drafts = tx.objectStore(draftStore);
                    return onRequest(drafts.get(id), (previous) => {
                        if (previous?.revision !== expectedRevision)
                            return { status: 'conflict' };
                        drafts.delete(id);
                        tx.objectStore(summaryStore).delete(id);
                        return { status: 'discarded' };
                    });
                });
                if (result.status === 'discarded')
                    committed();
                return result;
            }
            catch {
                return { status: 'unavailable' };
            }
        },
        async readSummaries(queries, { previewScope, signal }) {
            signal.throwIfAborted();
            const result = new Map();
            try {
                const prepared = await Promise.all(queries.map(async (query) => {
                    const subject = await deriveDraftSubject(query.subject);
                    const key = { scope: previewScope ?? defaultScope, definitionUrl: query.definitionUrl, subject };
                    return { query, id: storageKey(key), allowed: await authorized(key) };
                }));
                signal.throwIfAborted();
                const allowed = prepared.filter(({ query, allowed }) => {
                    if (!allowed)
                        result.set(query.key, { status: 'denied' });
                    return allowed;
                });
                if (allowed.length) {
                    await transaction(summaryStore, 'readonly', async (tx) => {
                        const store = tx.objectStore(summaryStore);
                        await Promise.all(allowed.map(async ({ query, id }) => {
                            const stored = await requestResult(store.get(id));
                            let observation = { status: 'absent' };
                            if (stored) {
                                if (stored.definitionVersion !== query.definitionVersion ||
                                    (stored.summary && sectionPlan(stored.summary.sections) !== sectionPlan(query.sections))) {
                                    observation = { status: 'stale' };
                                }
                                else
                                    observation = stored.summary?.progress ?? { status: 'unavailable' };
                            }
                            result.set(query.key, observation);
                        }));
                    });
                }
            }
            catch {
                for (const query of queries)
                    if (result.get(query.key)?.status !== 'denied') {
                        result.set(query.key, { status: 'unavailable' });
                    }
            }
            signal.throwIfAborted();
            return result;
        },
    };
}
