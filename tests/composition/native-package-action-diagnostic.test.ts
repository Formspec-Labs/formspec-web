import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpAdapterError } from '../../src/adapters/http/http-client.ts';
import { diagnoseNativePrepare, nativePrepareDiagnostic } from '../../src/composition/native-package-action-diagnostic.ts';

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
