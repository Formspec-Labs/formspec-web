import type { DraftKey } from '../../ports/draft-store.ts';
import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';
import type { IntakeHandoff } from '../../ports/submit-transport.ts';
import { IdentitySession, meetsAssurance, randomUuid } from '../identity/assurance.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

export interface AnonymousSessionBridgeConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
  sessionIdFactory?: () => string;
}

export interface AnonymousSession {
  sessionToken: string;
  subjectRef: string;
  formId: string;
  expiresAt: string;
}

interface AnonymousSessionView {
  session_token: string;
  subject_ref: string;
  form_id: string;
  expires_at: string;
}

interface SessionSlot {
  sessionId: string;
  session?: AnonymousSession;
  inFlight?: Promise<AnonymousSession>;
}

const EXPIRY_SKEW_MS = 60_000;

export class AnonymousSessionBridge {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;
  private readonly sessionIdFactory: () => string;
  private readonly sessions = new Map<string, SessionSlot>();

  constructor(config: AnonymousSessionBridgeConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
    this.sessionIdFactory = config.sessionIdFactory ?? (() => `web-${randomUuid()}`);
  }

  async sessionForForm(formUrl: string, version?: string): Promise<AnonymousSession> {
    const formId = this.formIdResolver(formUrl, version);
    let slot = this.sessions.get(formId);
    if (!slot) {
      slot = { sessionId: this.sessionIdFactory() };
      this.sessions.set(formId, slot);
    }
    if (slot.session && !expiresSoon(slot.session.expiresAt)) {
      return slot.session;
    }
    if (slot.inFlight) {
      return slot.inFlight;
    }

    slot.inFlight = this.issueSession(formId, slot.sessionId);
    try {
      slot.session = await slot.inFlight;
      return slot.session;
    } finally {
      slot.inFlight = undefined;
    }
  }

  async tokenForDraftKey(key: DraftKey): Promise<string | undefined> {
    if (key.subjectRef && !key.subjectRef.startsWith('anon:')) {
      return undefined;
    }
    const session = await this.sessionForForm(key.formUrl, key.formVersion);
    assertSubjectMatches(session.subjectRef, key.subjectRef);
    return session.sessionToken;
  }

  async tokenForHandoff(handoff: IntakeHandoff): Promise<string | undefined> {
    const subjectRef = handoff.subjectRef ?? undefined;
    if (subjectRef && !subjectRef.startsWith('anon:')) {
      return undefined;
    }
    const session = await this.sessionForForm(
      handoff.definitionRef.url,
      handoff.definitionRef.version ?? undefined,
    );
    assertSubjectMatches(session.subjectRef, subjectRef);
    return session.sessionToken;
  }

  private async issueSession(formId: string, sessionId: string): Promise<AnonymousSession> {
    const view = await this.client.postJson<AnonymousSessionView>(
      `/runtime/forms/${encodeURIComponent(formId)}/sessions/anonymous`,
      { session_id: sessionId },
    );
    return {
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
