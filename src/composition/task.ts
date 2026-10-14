import { computeJcsSha256Digest } from '../adapters/http/response-action-ledger.ts';
import { assertSynchronousGuard } from '../shared/synchronous-guard.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { CompletionLifetime } from '../ports/response-completion.ts';
import type { TaskDraftLaunchSelection } from '../ports/task-draft.ts';
import type { TaskCompletionSelection } from '../ports/task-completion.ts';
import type { FormDefinition, LocaleDocument } from '@formspec-org/types';
import { createHttpAdapterCohort } from '../adapters/http/cohort.ts';
import { HttpTaskDraftLaunch } from '../adapters/http/task-draft-launch.ts';
import { HttpTaskCandidateHydration, assertTaskHydrationSelection, taskRequiresExternalHydration, type HttpTaskCandidateHydrationConfig } from '../adapters/http/task-candidate-hydration.ts';
import { HttpTaskCompletion } from '../adapters/http/task-completion.ts';
import type { HttpClientConfig } from '../adapters/http/http-client.ts';
import type { HttpResponseSigningPolicy } from '../adapters/http/response-signing.ts';
import type { DraftResumeMetadataStore } from '../adapters/browser/draft-resume-metadata.ts';
import { createTaskResponseCompletion } from '../shared/task-response-completion.ts';

/** Explicit task owner selects maintained Source signing and WOS completion together. */
export async function createTaskComposition(config: {
  source: HttpClientConfig;
  wos: HttpClientConfig;
  /** Deployment-selected whole request wait; omission preserves the existing bound. */
  completionTimeoutMs?: number;
  launch: TaskDraftLaunchSelection;
  completion: TaskCompletionSelection;
  draftKey: DraftKey;
  formId: string;
  definition: FormDefinition;
  locales: readonly LocaleDocument[];
  signing: HttpResponseSigningPolicy;
  resumeMetadata: DraftResumeMetadataStore;
  assertCurrentSource: () => void;
  assertCurrentWos: () => void;
  launchOperationId: string;
  taskHydration?: Pick<HttpTaskCandidateHydrationConfig, 'selection' | 'identity' | 'receiptVerifier' | 'elapsedNow'>;
}, lifetime: CompletionLifetime) {
  const requiresHydration = taskRequiresExternalHydration(config.definition);
  const hasCandidateAuthority = !!config.signing.preSignCandidate || !requiresHydration && !!config.taskHydration;
  if (!hasCandidateAuthority || !config.source.accessToken || !config.wos.accessToken
    || !config.draftKey.subjectRef || config.launch.taskId !== config.completion.taskId
    || config.definition.url !== config.completion.definitionUrl || config.definition.version !== config.completion.definitionVersion
    || config.draftKey.formUrl !== config.definition.url || config.draftKey.formVersion !== config.definition.version) {
    throw new Error('Task composition requires selected current sessions, publication and task candidate hydration');
  }
  const selection = structuredClone({ launch: config.launch, completion: config.completion, draftKey: config.draftKey,
    definition: config.definition, locales: config.locales, formId: config.formId });
  const sourceSettings = { ...config.source, tenantBinding: config.source.tenantBinding ? structuredClone(config.source.tenantBinding) : undefined };
  const wosSettings = { ...config.wos, tenantBinding: config.wos.tenantBinding ? structuredClone(config.wos.tenantBinding) : undefined };
  const signing = Object.freeze({ ...config.signing });
  const resumeMetadata = config.resumeMetadata;
  const sourceGuard = config.assertCurrentSource;
  const wosGuard = config.assertCurrentWos;
  const launchOperationId = config.launchOperationId;
  const hydration = config.taskHydration ? { selection: structuredClone(config.taskHydration.selection),
    identity: structuredClone(config.taskHydration.identity), receiptVerifier: config.taskHydration.receiptVerifier ? Object.freeze({ verify: config.taskHydration.receiptVerifier.verify.bind(config.taskHydration.receiptVerifier) }) : undefined,
    elapsedNow: config.taskHydration.elapsedNow } : undefined;
  const check = () => { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent);
    assertSynchronousGuard(sourceGuard); };
  const rawToken = sourceSettings.accessToken!;
  const rawFetch = sourceSettings.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const source: HttpClientConfig = { ...sourceSettings, accessToken: async () => {
    check(); const token = typeof rawToken === 'function' ? await rawToken() : rawToken; check();
    if (!token?.trim()) throw new Error('Selected Source task session is unavailable');
    return token;
  }, fetchImpl: async (input, init) => {
    check();
    const signal = init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal;
    const response = await rawFetch(input, { ...init, signal });
    try { check(); return response; }
    catch (error) { await response.body?.cancel().catch(() => {}); throw error; }
  } };
  const completion = createTaskResponseCompletion({ selection: selection.completion,
    transport: new HttpTaskCompletion({ ...wosSettings, completionTimeoutMs: config.completionTimeoutMs,
      selection: selection.completion, assertCurrentAuth: wosGuard }) });
  const cohortConfig = { ...source,
    formIdResolver: (url: string, version?: string) => {
      if (url !== selection.definition.url || version !== selection.definition.version) throw new Error('Task publication mismatch');
      return selection.formId;
    },
    qualifiedDraftState: { definition: selection.definition, formVersionId: selection.launch.formVersionId, localeDocuments: [...selection.locales] },
    resumeMetadata, responseSigning: signing };
  if (hydration) {
    if (hydration.selection.formVersionId !== selection.launch.formVersionId || hydration.selection.formId !== selection.formId)
      throw new Error('Task hydration publication mismatch');
    if (await computeJcsSha256Digest(selection.definition) !== hydration.selection.definitionHash) throw new Error('Task hydration Definition digest mismatch');
    check();
    assertTaskHydrationSelection({ ...source, ...hydration, definition: selection.definition,
      formVersionHash: selection.launch.formVersionHash, subjectRef: selection.draftKey.subjectRef!, assertCurrent: check });
  }
  // Constructor validation must complete before Source creates a durable draft.
  createHttpAdapterCohort(cohortConfig);
  const launch = new HttpTaskDraftLaunch({ ...source, selection: selection.launch,
    expectedSubjectRef: selection.draftKey.subjectRef!, definition: selection.definition,
    assertCurrent: check, validateResponse: signing.validateResponse });
  check(); assertSynchronousGuard(wosGuard);
  const view = await launch.launch(launchOperationId, lifetime);
  check(); assertSynchronousGuard(wosGuard);
  const cohort = createHttpAdapterCohort({ ...cohortConfig, taskDraft: { key: selection.draftKey, view } });
  const candidateHydration = hydration && requiresHydration ? new HttpTaskCandidateHydration({ ...source, ...hydration,
    definition: selection.definition, formVersionHash: selection.launch.formVersionHash,
    taskDraft: view.taskDraft!, subjectRef: selection.draftKey.subjectRef!, assertCurrent: check }, lifetime) : undefined;
  const guarded = async <T>(operation: () => Promise<T>): Promise<T> => { check(); const result = await operation(); check(); return result; };
  const drafts = cohort.draftStore;
  const responseSigning = cohort.responseSigning!;
  return { ...cohort, draftStore: { ...drafts,
    load: (key: DraftKey) => guarded(() => drafts.load(key)),
    save: (...args: Parameters<typeof drafts.save>) => guarded(() => drafts.save(...args)),
    list: (...args: Parameters<typeof drafts.list>) => guarded(() => drafts.list(...args)),
    delete: (...args: Parameters<typeof drafts.delete>) => guarded(() => drafts.delete(...args)),
    invalidateSubject: (...args: Parameters<typeof drafts.invalidateSubject>) => guarded(() => drafts.invalidateSubject(...args)),
    ...(drafts.readState ? { readState: (key: DraftKey) => guarded(() => drafts.readState!(key)) } : {}),
  }, responseSigning: {
    saveDraft: (...args: Parameters<typeof responseSigning.saveDraft>) => guarded(() => responseSigning.saveDraft(...args)),
    prepare: (...args: Parameters<typeof responseSigning.prepare>) => guarded(() => responseSigning.prepare(...args)),
    sign: (...args: Parameters<typeof responseSigning.sign>) => guarded(() => responseSigning.sign(...args)),
  }, completion, launched: view, ...(candidateHydration ? { candidateHydration } : {}) };
}
