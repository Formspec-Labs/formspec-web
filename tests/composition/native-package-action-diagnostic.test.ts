import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpAdapterError } from '../../src/adapters/http/http-client.ts';
import { createNativeQualificationReporter, diagnoseNativePrepare, nativePrepareDiagnostic } from '../../src/composition/native-package-action-diagnostic.ts';

afterEach(() => vi.restoreAllMocks());
describe('bounded native Prepare diagnostic', () => {
  it('logs only stage and status, then preserves the exact port error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new HttpAdapterError('private URL token subject', 403, undefined, { response: 'private', access_token: 'secret' });
    await expect(diagnoseNativePrepare(async () => { throw error; })).rejects.toBe(error);
    expect(warn).toHaveBeenCalledExactlyOnceWith('Native form action failed', JSON.stringify({ stage: 'prepare-port', reason: 'http-refused', status: 403 }));
  });
  it.each([
    ['Preparation differs from the exact saved Response', 'saved-response-mismatch'],
    ['Signing content source, version or displayed locale does not match', 'signing-locale-mismatch'],
    ['Signing content failed the shared schema', 'signing-content-invalid'],
  ])('maps a known invariant to a finite reason without logging its message', (message, reason) => {
    expect(nativePrepareDiagnostic(new Error(message))).toEqual({ stage: 'prepare-port', reason });
  });
  it.each([new Error('arbitrary private response'), { message: 'Preparation differs from the exact saved Response', status: 401 },
    new HttpAdapterError('private', 999, undefined, 'secret')])('omits unknown messages, fields and invalid status', error => {
    expect(nativePrepareDiagnostic(error)).toEqual({ stage: 'prepare-port', reason: 'port-failed' });
  });
  it('returns the exact successful preparation without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prepared = { private: 'preserved' };
    expect(await diagnoseNativePrepare(async () => prepared)).toBe(prepared);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('closed native qualification diagnostic', () => {
  it('distinguishes the maintained HTTP timeout from the whole-operation deadline and unknown failures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = createNativeQualificationReporter();
    for (const error of [
      new DOMException('HTTP request timed out', 'TimeoutError'),
      new Error('native-facts-deadline'),
      new Error('HTTP request timed out'),
      new DOMException('private timeout detail', 'TimeoutError'),
    ]) report('source-qualification', error);
    expect(warn.mock.calls.map(call => JSON.parse(call[1]))).toEqual([
      { stage: 'source-qualification', reason: 'http-timeout' },
      { stage: 'source-qualification', reason: 'deadline' },
      { stage: 'source-qualification', reason: 'qualification-failed' },
      { stage: 'source-qualification', reason: 'qualification-failed' },
    ]);
  });
  it('distinguishes success, later retirement, and HTTP failure without private context', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = createNativeQualificationReporter();
    report('source-ready'); report('candidate-lifetime', new Error('renderer-dispose'));
    report('source-qualification', new HttpAdapterError('private token identity URL', 409, undefined, { response: 'secret' }));
    expect(warn.mock.calls.map(call => JSON.parse(call[1]))).toEqual([
      { stage: 'source-ready', reason: 'ready' }, { stage: 'candidate-lifetime', reason: 'renderer-retired' },
      { stage: 'source-qualification', reason: 'http-refused', status: 409 },
    ]);
  });
  it('limits each host to 32 closed events and isolates console failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('observer failed'); });
    const report = createNativeQualificationReporter();
    for (let index = 0; index < 40; index++) expect(() => report('source-qualification', new Error('private response'))).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(32);
    const next = createNativeQualificationReporter(); next('source-qualification', new HttpAdapterError('private', 999));
    expect(JSON.parse(warn.mock.calls.at(-1)![1])).toEqual({ stage: 'source-qualification', reason: 'qualification-failed' });
  });
});
