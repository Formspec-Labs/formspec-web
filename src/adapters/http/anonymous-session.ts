import { isRecord } from '../../shared/is-record.ts';
import type { DraftKey } from '../../ports/draft-store.ts';
import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';
import type { IntakeHandoff } from '../../ports/submit-transport.ts';
import { IdentitySession, meetsAssurance } from '../identity/assurance.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import type { DraftResumeMetadataStore } from '../browser/draft-resume-metadata.ts';

export interface AnonymousSessionBridgeConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
  resumeMetadata?: DraftResumeMetadataStore;
  validateFormContext?: (formUrl: string, version?: string) => Promise<void>;
}

export interface AnonymousSession {
  sessionId: string;
  sessionToken: string;
  subjectRef: string;
  formId: string;
  expiresAt: string;
}

interface AnonymousSessionView {
  session_id: string;
  session_token: string;
  subject_ref: string;
  form_id: string;
  expires_at: string;
}

interface SessionSlot {
  session?: AnonymousSession;
  inFlight?: Promise<AnonymousSession>;
}

const EXPIRY_SKEW_MS = 60_000;

export class AnonymousSessionBridge {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;
  private readonly sessions = new Map<string, SessionSlot>();
  private readonly resumeMetadata?: DraftResumeMetadataStore;
  private readonly validateFormContext?: AnonymousSessionBridgeConfig['validateFormContext'];
  private readonly generations = new Map<string, number>();

  constructor(config: AnonymousSessionBridgeConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.resumeMetadata = config.resumeMetadata;
    this.validateFormContext = config.validateFormContext;
  }

  async sessionForForm(formUrl: string, version?: string, requireExisting = false): Promise<AnonymousSession> {
    const formId = this.formIdResolver(formUrl, version);
    const generation = this.generations.get(formId) ?? 0;
    await this.validateFormContext?.(formUrl, version);
    if (generation !== (this.generations.get(formId) ?? 0)) throw new Error('Anonymous session context was cleared');
    let slot = this.sessions.get(formId);
    if (!slot) {
      const saved = this.resumeMetadata?.read(`grant:${formId}`);
      let session: AnonymousSession | undefined;
      if (saved !== undefined) {
        if (!isSession(saved, formId)) throw new Error('Stored anonymous grant is invalid or bound to another form');
        session = saved;
      }
      slot = { session };
      this.sessions.set(formId, slot);
    }
    if (slot.session) {
      if (expiresSoon(slot.session.expiresAt)) {
        throw new Error('Anonymous session is nearing expiration; renewal is required to preserve the active respondent');
      }
      return slot.session;
    }
    if (slot.inFlight) {
      return slot.inFlight;
    }
    if (requireExisting) throw new Error('The saved draft has no anonymous owner grant. Clear this computer before starting again.');

    slot.inFlight = this.issueSession(formId).then(session => {
      if (generation !== (this.generations.get(formId) ?? 0)) throw new Error('Anonymous session was cleared while it was being issued');
      this.resumeMetadata?.write(`grant:${formId}`, session);
      return session;
    });
    try {
      slot.session = await slot.inFlight;
      return slot.session;
    } finally {
      slot.inFlight = undefined;
    }
  }

  async tokenForDraftKey(key: DraftKey, requireExisting = false): Promise<string | undefined> {
    if (key.subjectRef && !key.subjectRef.startsWith('anon:')) {
      return undefined;
    }
    const session = await this.sessionForForm(key.formUrl, key.formVersion, requireExisting);
    assertSubjectMatches(session.subjectRef, key.subjectRef);
    return session.sessionToken;
  }

  async clearForForm(formUrl: string, version?: string, options: { preserveGrant?: boolean } = {}): Promise<void> {
    const formId = this.formIdResolver(formUrl, version);
    this.generations.set(formId, (this.generations.get(formId) ?? 0) + 1);
    const pending = this.sessions.get(formId)?.inFlight;
    if (pending) await pending.catch(() => {});
    if (options.preserveGrant) return;
    this.resumeMetadata?.remove(`grant:${formId}`);
    this.sessions.delete(formId);
  }

  async tokenForHandoff(handoff: IntakeHandoff, requireExisting = false): Promise<string | undefined> {
    const subjectRef = handoff.subjectRef ?? undefined;
    if (subjectRef && !subjectRef.startsWith('anon:')) {
      return undefined;
    }
    const session = await this.sessionForForm(
      handoff.definitionRef.url,
      handoff.definitionRef.version ?? undefined,
      requireExisting,
    );
    assertSubjectMatches(session.subjectRef, subjectRef);
    return session.sessionToken;
  }

  private async issueSession(formId: string): Promise<AnonymousSession> {
    const view = await this.client.postJson<AnonymousSessionView>(
      `/runtime/forms/${encodeURIComponent(formId)}/sessions/anonymous`,
      {},
    );
    if (!view || typeof view !== 'object') {
      throw new Error('Anonymous session response is invalid');
    }
    if (typeof view.session_id !== 'string' || !view.session_id.trim()) {
      throw new Error('Anonymous session response is missing its server-issued session ID');
    }
    if (typeof view.session_token !== 'string' || !view.session_token.trim()
      || typeof view.subject_ref !== 'string' || !view.subject_ref.startsWith('anon:')
      || view.subject_ref.length <= 5 || view.form_id !== formId
      || typeof view.expires_at !== 'string' || !Number.isFinite(Date.parse(view.expires_at))
      || Date.parse(view.expires_at) <= Date.now()) {
      throw new Error('Anonymous session response has invalid authentication or form binding');
    }
    return {
      sessionId: view.session_id,
      sessionToken: view.session_token,
      subjectRef: view.subject_ref,
      formId: view.form_id,
      expiresAt: view.expires_at,
    };
  }
}

export class HttpAnonymousIdentityProvider implements IdentityProvider {
  private readonly bridge: AnonymousSessionBridge;
  private readonly formUrl: string;
  private readonly formVersion?: string;
  private readonly session = new IdentitySession();

  constructor({
    bridge,
    formUrl,
    formVersion,
  }: {
    bridge: AnonymousSessionBridge;
    formUrl: string;
    formVersion?: string;
  }) {
    this.bridge = bridge;
    this.formUrl = formUrl;
    this.formVersion = formVersion;
  }

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    const option: IdpOption = { kind: 'anonymous', minAssurance: 'L1' };
    return meetsAssurance(option.minAssurance, formAssuranceRequirements) ? [option] : [];
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    if (option.kind !== 'anonymous') {
      throw new Error('HttpAnonymousIdentityProvider can only authenticate anonymous options');
    }
    const anonymousSession = await this.bridge.sessionForForm(this.formUrl, this.formVersion);
    const claim: IdentityClaim = {
      provider: 'formspec-server-anonymous-session',
      adapter: 'formspec-server-anonymous-session@0',
      subjectRef: anonymousSession.subjectRef,
      credentialType: 'provider-assertion',
      credentialRef: `anonymous-session:${anonymousSession.formId}`,
      personhoodCheck: 'not-performed',
      subjectBinding: 'respondent',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
      expiresAt: anonymousSession.expiresAt,
    };
    this.session.set(claim);
    return claim;
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    await this.bridge.clearForForm(this.formUrl, this.formVersion);
    this.session.set(null);
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    return this.session.subscribe(listener);
  }
}

export function createAnonymousSessionBridge(
  config: AnonymousSessionBridgeConfig,
): AnonymousSessionBridge {
  return new AnonymousSessionBridge(config);
}

function expiresSoon(expiresAt: string): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() <= EXPIRY_SKEW_MS;
}

function assertSubjectMatches(serverSubjectRef: string, requestedSubjectRef: string | undefined): void {
  if (requestedSubjectRef && requestedSubjectRef !== serverSubjectRef) {
    throw new Error('Anonymous session subject does not match the active respondent subject');
  }
}

function isSession(value: unknown, formId: string): value is AnonymousSession {
  return isRecord(value)
    && typeof value.sessionId === 'string' && value.sessionId.trim().length > 0
    && typeof value.sessionToken === 'string' && value.sessionToken.trim().length > 0
    && typeof value.subjectRef === 'string' && value.subjectRef.startsWith('anon:') && value.subjectRef.length > 5
    && value.formId === formId && typeof value.expiresAt === 'string'
    && Number.isFinite(Date.parse(value.expiresAt));
}
