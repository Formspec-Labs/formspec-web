/** @filedesc Retain editable draft sessions across browser history and qualify all access by key. */
import { createFormEngine, initFormspecEngine, initFormspecEngineTools, responseSubjectId, } from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { resolvePageSequence } from '@formspec-org/layout';
import { createDraftWriter } from './draft-writer.js';
export async function deriveDraftSubject(subject) {
    if (!subject)
        return undefined;
    await initFormspecEngine();
    await initFormspecEngineTools();
    return { ...subject, id: responseSubjectId(subject.type, subject.keys) };
}
function sessionKey(key, version) {
    return JSON.stringify([key.scope, key.definitionUrl, key.subject?.id ?? null, version]);
}
export function createDraftSession(storage, browserPort, checkpointPorts) {
    const entries = new Map();
    const lifetime = new AbortController();
    async function load(key, version, signal) {
        signal.throwIfAborted();
        const result = await storage.port.load(key, version, signal);
        signal.throwIfAborted();
        return result;
    }
    function release(entry) {
        if (entry.consumers.size === 0 && entry.opened?.status === 'ready')
            entry.opened.writer.setMounted(false);
    }
    function disposeEntry(entry) {
        if (entry.opened?.status === 'ready') {
            entry.opened.writer.dispose();
            entry.opened.engine.dispose();
        }
    }
    return {
        scope: storage.scope,
        port: storage.port,
        restart: browserPort?.restart,
        acquire(key, input, report) {
            const definition = input.plan.definition;
            const id = sessionKey(key, definition.version);
            let entry = entries.get(id);
            const previous = entry?.opened;
            const previousConsumers = entry?.consumers;
            if (entry && previous && entry.consumers.size === 0 && (previous.status !== 'ready' || !previous.writer.dirty)) {
                entries.delete(id);
                entry = undefined;
            }
            if (!entry) {
                const reusable = previous?.status === 'ready' ? previous : undefined;
                const consumers = previousConsumers ?? new Set();
                const opened = async () => {
                    let loaded;
                    try {
                        loaded = await load(key, definition.version, lifetime.signal);
                    }
                    catch (error) {
                        if (reusable) {
                            reusable.writer.dispose();
                            reusable.engine.dispose();
                        }
                        throw error;
                    }
                    const draft = loaded.status === 'loaded' ? loaded.draft : undefined;
                    if (reusable) {
                        if (draft && draft.revision === reusable.writer.revision) {
                            return reusable;
                        }
                        reusable.writer.dispose();
                        reusable.engine.dispose();
                    }
                    if (loaded.status === 'version-mismatch')
                        return { ...loaded, key };
                    if (loaded.status === 'denied' || loaded.status === 'unavailable')
                        return { status: loaded.status };
                    const seed = created.seed;
                    if (!draft && seed.draftSeed)
                        return { status: seed.draftSeed };
                    const response = draft && parseJsonExact(draft.responseJson);
                    const draftSnapshot = draft && parseJsonExact(draft.snapshotJson);
                    const engine = createFormEngine(definition, {
                        ...(key.subject && { responseSubject: key.subject }),
                        ...(draftSnapshot && { draftSnapshot }),
                        ...(!draftSnapshot && seed.initialData?.data !== undefined && {
                            responseData: seed.initialData.data,
                        }),
                    });
                    try {
                        const writer = createDraftWriter({
                            engine, key, draft, port: storage.port,
                            responseId: response?.id ?? input.semanticControlScope?.responseId,
                            author: response?.author ?? storage.author,
                            locally: browserPort !== undefined,
                            sections: resolvePageSequence(definition, {
                                ...(input.componentDocument ? { component: input.componentDocument } : {}),
                                ...(input.grant.themeDocument ? { theme: input.grant.themeDocument } : {}),
                            }),
                            actions: input.responseActionsDocument,
                            invoker: input.responseActionInvoker,
                            checkpointPorts,
                            report: (notice, options) => { for (const notify of consumers)
                                notify(notice, options); },
                        });
                        return { status: 'ready', engine, writer };
                    }
                    catch (error) {
                        engine.dispose();
                        throw error;
                    }
                };
                const created = {
                    consumers,
                    seed: { initialData: input.initialData, draftSeed: input.draftSeed },
                    result: opened().catch(() => ({ status: 'unavailable' })).then(result => {
                        created.opened = result;
                        if (lifetime.signal.aborted)
                            disposeEntry(created);
                        else if (result.status === 'ready')
                            result.writer.setMounted(consumers.size > 0);
                        return result;
                    }),
                };
                entries.set(id, created);
                entry = created;
            }
            const tracked = entry;
            if (tracked.consumers.size === 0) {
                tracked.seed = { initialData: input.initialData, draftSeed: input.draftSeed };
            }
            tracked.consumers.add(report);
            if (tracked.opened?.status === 'ready')
                tracked.opened.writer.setMounted(true);
            return {
                result: tracked.result,
                release() {
                    tracked.consumers.delete(report);
                    release(tracked);
                },
            };
        },
        async readCommitted(definition, subject, options) {
            try {
                const signal = options?.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal;
                signal.throwIfAborted();
                const key = { scope: storage.scope, definitionUrl: definition.url, subject: await deriveDraftSubject(subject) };
                if (options?.afterPendingSaves) {
                    const entry = await entries.get(sessionKey(key, definition.version))?.result;
                    if (entry?.status === 'ready' && !await entry.writer.waitForSaves())
                        return { status: 'save-failed' };
                }
                const result = await load(key, definition.version, signal);
                if (result.status !== 'loaded')
                    return { status: result.status };
                const response = parseJsonExact(result.draft.responseJson);
                return { status: 'loaded', response, revision: result.draft.revision, key };
            }
            catch {
                return { status: 'unavailable' };
            }
        },
        async leave() {
            const results = await Promise.all([...entries.values()].filter(entry => entry.consumers.size > 0).map(async (entry) => {
                const opened = await entry.result;
                return opened.status !== 'ready' || await opened.writer.leave();
            }));
            return results.every(Boolean);
        },
        writerFor(key, version) {
            const opened = entries.get(sessionKey(key, version))?.opened;
            return opened?.status === 'ready' ? opened.writer : undefined;
        },
        dispose() {
            lifetime.abort();
            for (const entry of entries.values())
                disposeEntry(entry);
            entries.clear();
        },
    };
}
