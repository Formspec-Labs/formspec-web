import { wosTenantScopeHeaders } from '../../profiles/wos-tenant-headers.ts';
import { abortable } from '../../shared/abortable.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { captureStatusCaseLedgerId } from '../../shared/status-case-id.ts';
import type { BrowserAuthSession } from '../../ports/browser-auth-session.ts';
import { StatusReadError, type StatusReader, type StatusRequest, type ApplicantCaseDetail } from '../../ports/status-reader.ts';
import { validateApplicantCaseDetail } from '../schema/applicant-case-detail.ts';
import { defaultFetch, HttpAdapterError, HttpClient, type HttpClientConfig } from './http-client.ts';

export interface HttpStatusReaderConfig extends Omit<HttpClientConfig, 'accessToken'> {
  readonly caseLedgerId: string;
  readonly issuer: string;
  readonly browserAuthSession: BrowserAuthSession;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}

/** Selected durable case read. WOS owns applicant ownership and current task permissions. */
export class HttpStatusReader implements StatusReader {
  private readonly config: HttpStatusReaderConfig;
  private readonly scopeHeaders: Readonly<Record<string, string>>;
  constructor(config: HttpStatusReaderConfig) {
    this.scopeHeaders = wosTenantScopeHeaders(config.tenantBinding);
    this.config = { ...config, caseLedgerId: captureStatusCaseLedgerId(config.caseLedgerId),
      assertCurrent: config.assertCurrent.bind(config),
      tenantBinding: config.tenantBinding ? structuredClone(config.tenantBinding) : undefined };
  }
  async readStatus(request: StatusRequest): Promise<ApplicantCaseDetail> {
    const config = this.config;
    if (request.resourceRef !== config.caseLedgerId || Object.keys(request).some(key => key !== 'resourceRef'))
      throw new StatusReadError('access-denied');
    config.signal.throwIfAborted(); assertSynchronousGuard(config.assertCurrent);
    const session = config.browserAuthSession;
    const selected = await abortable(config.signal, session.getSession());
    if (!selected || selected.issuer !== config.issuer || Date.parse(selected.expiresAt) <= Date.now()
      || !Number.isFinite(Date.parse(selected.expiresAt))) throw new StatusReadError('sign-in-required');
    const key = (state: typeof selected) => JSON.stringify([state.issuer, state.subject, state.revision, state.expiresAt]);
    const selectedKey = key(selected);
    let retired = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    config.signal.addEventListener('abort', abort, { once: true });
    const unsubscribe = session.subscribe(state => {
      if (!state || key(state) !== selectedKey) { retired = true; abort(); }
    });
    const assertCurrent = () => {
      assertSynchronousGuard(config.assertCurrent); config.signal.throwIfAborted();
      if (retired || Date.parse(selected.expiresAt) <= Date.now()) throw new StatusReadError('sign-in-required');
      controller.signal.throwIfAborted();
    };
    try {
      assertCurrent();
      const transport = config.fetchImpl ?? defaultFetch();
      const client = new HttpClient({ ...config, tenantBinding: undefined,
        fetchImpl: (input, init) => transport(input, { ...init, credentials: 'omit', cache: 'no-store' }),
        accessToken: async () => {
          assertCurrent(); const token = await session.accessToken(); assertCurrent();
          if (!token) throw new StatusReadError('sign-in-required');
          return token;
        } });
      const value = await client.getJson<unknown>('/api/v1/applicant/cases/' + encodeURIComponent(config.caseLedgerId), {
        headers: this.scopeHeaders, signal: controller.signal, assertCurrent, timeoutMs: 10_000, maxResponseBytes: 2 * 1024 * 1024,
        requireJson: true, successStatuses: [200] });
      assertCurrent();
      const rawId = config.caseLedgerId.startsWith('urn:wos:') ? config.caseLedgerId.slice(8) : config.caseLedgerId;
      if (!validateApplicantCaseDetail(value) || value.summary.id !== 'urn:wos:' + rawId
        || value.openTasks.some(task => !['pending', 'drafted'].includes(task.status))
        || new Set(value.openTasks.map(task => task.id)).size !== value.openTasks.length
        || value.summary.actionNeeded !== (value.openTasks.length > 0)) throw new StatusReadError('unavailable');
      return value;
    } catch (error) {
      if (retired) throw new StatusReadError('sign-in-required');
      if (error instanceof StatusReadError) throw error;
      if (error instanceof HttpAdapterError && [401, 403, 404].includes(error.status))
        throw new StatusReadError(error.status === 401 ? 'sign-in-required' : 'access-denied');
      if (config.signal.aborted) throw error;
      throw new StatusReadError('unavailable');
    } finally {
      unsubscribe(); config.signal.removeEventListener('abort', abort); abort();
    }
  }
}
