import canonicalize from 'canonicalize';
import { isApplicationDraftId } from '../../shared/application-draft-id.ts';
import { planServiceRequest, resolveResponseAction, resolveResponseActionValidationTuple, resolveServiceRequest } from '@formspec-org/engine/render';
import type { AdmittedResponseAction } from '../../ports/response-signing.ts';
import type { ApplicationCaseReceipt, ApplicationLifecycle, ApplicationLifecycleCapabilities } from '../../ports/application-lifecycle.ts';
import type { DraftKey } from '../../ports/draft-store.ts';
import type { DraftBindingRegistry } from './draft-binding-registry.ts';
import type { HttpClient } from './http-client.ts';
import type { ResponseSigningScopeFence } from './response-signing.ts';

type Publication = { formId: string; formVersionId: string };
function strict(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export async function readApplicationLifecycleCapabilities(client: HttpClient, publication: Publication): Promise<ApplicationLifecycleCapabilities> {
  const value = await client.getJson<unknown>(`/runtime/forms/${encodeURIComponent(publication.formId)}/application-lifecycle`, { successStatuses: [200] });
  if (!strict(value, ['earlyCaseCreation', 'persistentSaving', 'formVersionId'])
    || typeof value.earlyCaseCreation !== 'boolean' || typeof value.persistentSaving !== 'boolean'
    || value.formVersionId !== publication.formVersionId || !publication.formVersionId.trim()) throw new Error('Application capabilities differ from the admitted publication');
  return Object.freeze({ earlyCaseCreation: value.earlyCaseCreation, persistentSaving: value.persistentSaving, formVersionId: publication.formVersionId });
}
export class HttpApplicationLifecycle implements ApplicationLifecycle {
  readonly capabilities: Readonly<ApplicationLifecycleCapabilities>;
  private readonly publication: Publication;
  private readonly action: AdmittedResponseAction;
  private readonly definition: { url: string; version: string };
  constructor(private readonly config: { client: HttpClient; publication: Publication; definition: { url: string; version: string };
    capabilities: ApplicationLifecycleCapabilities; action: AdmittedResponseAction; bindings: DraftBindingRegistry; fence: ResponseSigningScopeFence }) {
    this.config = Object.freeze({ ...config });
    this.action = structuredClone(config.action);
    this.publication = structuredClone(config.publication); this.definition = structuredClone(config.definition);
    if (config.capabilities.formVersionId !== this.publication.formVersionId) throw new Error('Application capabilities differ from publication');
    this.capabilities = Object.freeze(structuredClone(config.capabilities));
  }
  async start(key: DraftKey, operationId: string): Promise<ApplicationCaseReceipt> {
    const receipt = await this.request('POST', key, operationId);
    if (!receipt) throw new Error('Application Start did not confirm a case');
    return receipt;
  }
  load(key: DraftKey): Promise<ApplicationCaseReceipt | undefined> { return this.request('GET', key); }
  /** Cohort composes this read inside its already-held draft operation guard. */
  loadInCurrentScope(key: DraftKey, generation: number): Promise<ApplicationCaseReceipt | undefined> { return this.request('GET', key, undefined, generation); }
  private request(method: 'GET' | 'POST', suppliedKey: DraftKey, operationId?: string, heldGeneration?: number): Promise<ApplicationCaseReceipt | undefined> {
    const key = structuredClone(suppliedKey);
    const operation = async (generation: number): Promise<ApplicationCaseReceipt | undefined> => {
      const current = () => this.config.fence.assertCurrent(key, generation);
      current();
      if ((method === 'POST' && (!this.capabilities.earlyCaseCreation || !operationId?.trim())) || key.formUrl !== this.definition.url || key.formVersion !== this.definition.version
        || !key.subjectRef?.trim() || key.subjectRef.startsWith('anon:')) throw new Error('Application Start requires the admitted authenticated owner');
      const binding = this.config.bindings.get(key);
      if (!binding || !isApplicationDraftId(binding.draftId)) throw new Error('Application Start requires an owned draft');
      const action = resolveResponseAction(this.action.document, this.action.actionRef).action;
      if (!action || this.action.document.scope !== 'response' || this.action.document.targetDefinition?.url !== this.definition.url
        || !this.action.artifactRef || !this.action.artifactDigest || action.intent !== 'x-start-application'
        || canonicalize(resolveResponseActionValidationTuple(action)) !== canonicalize({ profile: 'off', blocking: 'non-blocking', persistence: 'none' })
        || action.effects?.length !== 1 || action.effects[0].type !== 'serviceRequest'
        || action.effects[0].requestRef !== this.action.requestRef || action.effects[0].idempotencyKey !== '@invocation.id') throw new Error('Application Start action is not admitted');
      const request = resolveServiceRequest(this.action.document['x-formspec-runtime'], this.action.requestRef);
      const planned = planServiceRequest(request, { input: { draftId: binding.draftId } });
      if (planned.method !== 'POST' || planned.path !== `/drafts/${encodeURIComponent(binding.draftId)}/application-case`
        || canonicalize(planned.body) !== '{}' || Object.keys(planned.headers).length || canonicalize(request.successStatuses) !== '[200]'
        || Object.values(request.outputs ?? {}).some(output => !['/caseLedgerId', '/caseReference', '/draftRef', '/status'].includes(output.path)
          || (output.exposure !== undefined && output.exposure !== 'internal'))) throw new Error('Application Start request is not admitted');
      const path = `/drafts/${encodeURIComponent(binding.draftId)}/application-case`;
      const value = method === 'GET' ? await this.config.client.getJson<unknown>(path, { successStatuses: [200], assertCurrent: current })
        : await this.config.client.postJson<unknown>(path, {}, { idempotencyKey: operationId, successStatuses: [200], assertCurrent: current });
      current();
      if (this.config.bindings.get(key)?.draftId !== binding.draftId) throw new Error('Application draft changed during lookup');
      if (method === 'GET' && value === null) return undefined;
      if (!strict(value, ['caseLedgerId', 'caseReference', 'draftRef', 'status'])
        || value.draftRef !== `urn:formspec:draft:${binding.draftId}`
        || typeof value.caseLedgerId !== 'string' || !value.caseLedgerId.startsWith('urn:wos:') || value.caseLedgerId.length <= 8
        || typeof value.caseReference !== 'string' || !value.caseReference.trim()
        || [...(value.caseLedgerId + value.caseReference)].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159)
        || (value.status !== 'in-progress' && value.status !== 'submitted')) throw new Error('Application receipt differs from its owned draft');
      return Object.freeze({ caseLedgerId: value.caseLedgerId, caseReference: value.caseReference, draftRef: value.draftRef, status: value.status });
    };
    return heldGeneration === undefined ? this.config.fence.run(key, operation) : operation(heldGeneration);
  }
}
