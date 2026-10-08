import { describe, expect, it } from 'vitest';
import { HttpAdapterError } from '../../src/adapters/http/http-client.ts';
import { OidcAssuranceError, assuranceLevelFromAcr } from '../../src/adapters/identity/oidc.ts';
import { NativePackageAdmissionError, atNativeAdmissionStage, nativeAdmissionDiagnostic } from '../../src/composition/native-package-admission-error.ts';

describe('bounded native admission diagnostics', () => {
  it('retains the innermost failed stage without exposing the HTTP problem or body', async () => {
    const cause = new HttpAdapterError('private failure text', 401, undefined, { access_token: 'secret', sub: 'person' });
    let failure: unknown;
    try { await atNativeAdmissionStage('package', () => atNativeAdmissionStage('publication', async () => { throw cause; })); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(NativePackageAdmissionError);
    expect(nativeAdmissionDiagnostic(failure)).toEqual({ stage: 'publication', status: 401 });
    expect((failure as Error).message).toBe(cause.message);
  });
  it.each(['0', '1'])('reports only numeric ACR %s for actual mapping refusal', acr => {
    let failure: unknown;
    try { assuranceLevelFromAcr(acr, { '1': 'L2' }); if (acr === '1') throw new OidcAssuranceError('below-minimum', acr, 'private details'); }
    catch (cause) { failure = new NativePackageAdmissionError('identity', cause); }
    expect(nativeAdmissionDiagnostic(failure)).toEqual({ stage: 'identity', reason: acr === '0' ? 'unmapped-acr' : 'below-minimum', acr });
  });
  it.each([undefined, ['0'], { acr: '0', access_token: 'secret' }, 'private-subject', 'eyJ.token.signature', '1234'])('omits arbitrary or nonscalar ACR %s', acr => {
    expect(nativeAdmissionDiagnostic(new NativePackageAdmissionError('identity',
      new OidcAssuranceError('unmapped-acr', acr, 'private failure')))).toEqual({ stage: 'identity', reason: 'unmapped-acr' });
  });
  it('omits arbitrary error fields and invalid HTTP status', () => {
    expect(nativeAdmissionDiagnostic({ stage: 'identity', acr: 'secret', status: 401 })).toEqual({ stage: 'load-or-recovery' });
    expect(nativeAdmissionDiagnostic(new NativePackageAdmissionError('saved-access',
      new HttpAdapterError('private', 999, undefined, 'secret')))).toEqual({ stage: 'saved-access' });
  });
  it('refuses a malformed stage on a genuine error instance', () => {
    const failure = new NativePackageAdmissionError('identity', new Error('private'));
    Object.assign(failure, { stage: 'private-person-or-token' });
    expect(nativeAdmissionDiagnostic(failure)).toEqual({ stage: 'load-or-recovery' });
  });
});
