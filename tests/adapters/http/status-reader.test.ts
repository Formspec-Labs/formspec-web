import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../../src/adapters/http/http-client.ts';
import { HttpStatusReader } from '../../../src/adapters/http/status-reader.ts';
import type { BrowserAuthSessionState } from '../../../src/ports/browser-auth-session.ts';

function fixture() {
  const caseLedgerId = 'urn:wos:test_case_00000000000000000000000000';
  let state: BrowserAuthSessionState | null = { issuer: 'https://idp.test', subject: 'applicant', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
  const listeners = new Set<(value: BrowserAuthSessionState | null) => void>();
  const session = { getSession: vi.fn(async () => state), accessToken: vi.fn(async () => 'current-token'),
    subscribe(listener: (value: BrowserAuthSessionState | null) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    begin: async () => {}, completeCallback: vi.fn(), completeSilentCallback: async () => {}, renew: vi.fn(), logout: async () => {}, completeLogoutCallback: async () => {}, dispose: () => {} };
  const detail = { summary: { id: caseLedgerId, workflowUrl: 'https://workflow.test/current', lifecycleState: 'active', actionNeeded: false, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }, openTasks: [], recentNotifications: [], statusTimeline: [] };
  const fetchImpl = vi.fn<FetchLike>(async () => new Response(JSON.stringify(detail), { headers: { 'content-type': 'application/json' } }));
  const controller = new AbortController();
  const config = { baseUrl: 'https://wos.test', caseLedgerId, issuer: 'https://idp.test', browserAuthSession: session,
    fetchImpl, signal: controller.signal, assertCurrent: vi.fn() };
  return { config, detail, session, fetchImpl, controller, listeners, change(value: BrowserAuthSessionState | null) { state = value; listeners.forEach(listener => listener(value)); } };
}

describe('protected current applicant status', () => {
  it('encodes the whole opaque case and uses current bearer without ambient cookies', async () => {
    const f = fixture(); const reader = new HttpStatusReader(f.config);
    expect(await reader.readStatus({ resourceRef: f.config.caseLedgerId })).toEqual(f.detail);
    expect(f.fetchImpl.mock.calls[0][0]).toBe('https://wos.test/api/v1/applicant/cases/' + encodeURIComponent(f.config.caseLedgerId));
    const init = f.fetchImpl.mock.calls[0][1]!;
    expect(init.credentials).toBe('omit'); expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer current-token');
    expect(f.listeners.size).toBe(0);
  });
  it('accepts the same canonical ledger response for the selected raw durable ID', async () => {
    const f = fixture(); f.config.caseLedgerId = f.config.caseLedgerId.slice(8);
    expect(await new HttpStatusReader(f.config).readStatus({ resourceRef: f.config.caseLedgerId })).toEqual(f.detail);
  });
  it.each([401, 403, 404, 503])('never converts HTTP %i into successful empty status', async status => {
    const f = fixture(); f.fetchImpl.mockImplementation(async () => new Response('{}', { status, headers: { 'content-type': 'application/json' } }));
    await expect(new HttpStatusReader(f.config).readStatus({ resourceRef: f.config.caseLedgerId })).rejects.toMatchObject({
      code: status === 401 ? 'sign-in-required' : status === 503 ? 'unavailable' : 'access-denied' });
  });
  it.each(['wrong-case', 'malformed', 'contradictory-action', 'invalid-date', 'invalid-urn'])('refuses %s response', async mode => {
    const f = fixture();
    const detail = mode === 'wrong-case' ? { ...f.detail, summary: { ...f.detail.summary, id: 'urn:wos:other' } }
      : mode === 'invalid-date' ? { ...f.detail, summary: { ...f.detail.summary, createdAt: 'not-a-date' } }
      : mode === 'invalid-urn' ? { ...f.detail, summary: { ...f.detail.summary, id: 'urn:wos:fake' } }
      : mode === 'contradictory-action' ? { ...f.detail, summary: { ...f.detail.summary, actionNeeded: true } } : {};
    f.fetchImpl.mockImplementation(async () => new Response(JSON.stringify(detail), { headers: { 'content-type': 'application/json' } }));
    await expect(new HttpStatusReader(f.config).readStatus({ resourceRef: f.config.caseLedgerId })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('rejects a changed case request before dispatch', async () => {
    const f = fixture(); await expect(new HttpStatusReader(f.config).readStatus({ resourceRef: 'other' })).rejects.toMatchObject({ code: 'access-denied' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('requires a live ordinary session before dispatch', async () => {
    const f = fixture(); f.change(null);
    await expect(new HttpStatusReader(f.config).readStatus({ resourceRef: f.config.caseLedgerId })).rejects.toMatchObject({ code: 'sign-in-required' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('retires a pending read when the session owner changes', async () => {
    const f = fixture(); let release!: (value: Response) => void;
    f.fetchImpl.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = new HttpStatusReader(f.config).readStatus({ resourceRef: f.config.caseLedgerId });
    const outcome = expect(pending).rejects.toMatchObject({ code: 'sign-in-required' });
    await vi.waitFor(() => expect(f.fetchImpl).toHaveBeenCalled());
    f.change({ issuer: 'https://idp.test', subject: 'different', revision: 2, expiresAt: '2099-01-01T00:00:00Z' });
    release(new Response(JSON.stringify(f.detail), { headers: { 'content-type': 'application/json' } }));
    await outcome;
  });
});


it.each(['resolve', 'reject'])('refuses an asynchronous %s owner guard before credentials or dispatch', async mode => {
  const f = fixture();
  const assertCurrent = async () => { if (mode === 'reject') throw new Error('retired'); };
  await expect(new HttpStatusReader({ ...f.config, assertCurrent }).readStatus({ resourceRef: f.config.caseLedgerId })).rejects.toThrow();
  expect(f.session.getSession).not.toHaveBeenCalled();
  expect(f.session.accessToken).not.toHaveBeenCalled();
  expect(f.fetchImpl).not.toHaveBeenCalled();
});


it.each(['.', '..', 'urn:wos:'])('refuses invalid raw ledger %s before any credentials', caseLedgerId => {
  const f = fixture();
  expect(() => new HttpStatusReader({ ...f.config, caseLedgerId })).toThrow();
  expect(f.session.getSession).not.toHaveBeenCalled();
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

it('stops waiting promptly when caller cancels a pending session lookup', async () => {
  const f = fixture(); let release!: (state: BrowserAuthSessionState | null) => void;
  f.session.getSession.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = new HttpStatusReader(f.config).readStatus({ resourceRef: f.config.caseLedgerId });
  const outcome = pending.then(() => 'resolved', () => 'aborted');
  f.controller.abort();
  const settled = await Promise.race([outcome, new Promise(resolve => setTimeout(() => resolve('still-waiting'), 20))]);
  release(null); await outcome;
  expect(settled).toBe('aborted');
  expect(f.session.accessToken).not.toHaveBeenCalled();
  expect(f.fetchImpl).not.toHaveBeenCalled();
});
