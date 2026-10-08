import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import { UI_STRINGS } from '@formspec-org/layout';
import type { ComponentDocument, LocaleDocument } from '@formspec-org/types';
import { NativePackageRoot, NativePackageRuntime } from '../../src/app/NativePackageRuntime.tsx';
import { rememberNativeSignInReturn } from '../../src/app/auth-callback.ts';
import { createBrowserScopedMetadataStore } from '../../src/shared/browser-scoped-metadata.ts';
import { NativePackageAdmissionError } from '../../src/composition/native-package-admission-error.ts';
import { OidcAssuranceError } from '../../src/adapters/identity/oidc.ts';
import type { BrowserAuthSessionState } from '../../src/ports/browser-auth-session.ts';
import type { NativePackageBoot } from '../../src/composition/native-package.ts';
import type { NativePackageSigningHost } from '../../src/shared/native-package-signing-host.ts';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
const observed = vi.hoisted(() => ({ choose: vi.fn(), props: undefined as { location: string; onNavigate: (href: string) => void } | undefined }));
vi.mock('../../src/app/NativePackageRespondentHost.tsx', () => ({ NativePackageRespondentHost: (props: typeof observed.props) => {
  observed.props = props; return <div data-testid="native-route">{props?.location}</div>;
} }));
vi.mock('../../src/app/main-helpers.ts', () => ({ chooseComposition: observed.choose }));
const fixtureRoot = resolve('tests/fixtures/native-signing-r5');
const exported = JSON.parse(readFileSync(resolve(fixtureRoot, 'native-bundle.json'), 'utf8')) as BundleExport;
const bundle = dereferenceBundleExport(exported);
const componentDocument = JSON.parse(readFileSync(resolve(fixtureRoot, 'passport-renewal.component.json'), 'utf8')) as ComponentDocument;
const localeDocuments = Object.values(exported.documents).filter(document => typeof document === 'object' && document !== null && '$formspecLocale' in document) as LocaleDocument[];
afterEach(() => { cleanup(); observed.props = undefined; observed.choose.mockReset(); window.history.replaceState(null, '', '/'); window.sessionStorage.clear(); });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function fixture() {
  let state: Partial<ReturnType<NativePackageSigningHost['getSnapshot']>> = { generation: 1, locale: 'en', cleared: false, controller: {} as NonNullable<ReturnType<NativePackageSigningHost['getSnapshot']>['controller']>, runtime: undefined };
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const host = {
    getStartupRoute: () => ({ entryHref: '/', entryTitle: undefined, requiresHostState: false }),
    bundle, moduleId: 'x-demo-signing', reviewOptions: {}, configureRuntime: vi.fn(), widgetExecutor: vi.fn(),
    dispose: vi.fn(), getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    selectLocale: vi.fn(async (locale: string) => { state = { ...state, locale }; emit(); }),
    clearDraftAccess: vi.fn(async () => { state = { ...state, cleared: true }; emit(); }),
  } as unknown as NativePackageSigningHost;
  const composition = createStubComposition();
  const boot: NativePackageBoot = { composition, host, componentDocument, localeDocuments, moduleId: host.moduleId, initialLocale: 'en' };
  const load = vi.fn(async () => boot);
  composition.nativePackageRespondent = { load };
  return { composition, boot, host, load, publish: (next: Partial<typeof state>) => { state = { ...state, ...next }; emit(); } };
}
describe('native package boot and scoped recovery', () => {
  it('offers explicit selected OIDC sign-in before loading the native form', async () => {
    const test = fixture();
    const authenticate = vi.fn(async () => { throw new Error('Provider unavailable'); });
    test.composition.browserAuthSession = { getSession: async () => null } as never;
    test.composition.identityProvider = {
      discover: async () => [
        { kind: 'anonymous', minAssurance: 'L1' },
        { kind: 'oidc', issuer: departmentAppProfile.identity.oidc!.issuer, displayName: 'Applicant account', minAssurance: 'L2' },
      ], authenticate, revoke: async () => {}, subscribe: () => () => {},
    };
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    const signIn = await screen.findByRole('button', { name: 'Sign in with Applicant account' });
    expect(test.load).not.toHaveBeenCalled(); expect(authenticate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('native-route')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue without an account' })).toBeNull();
    fireEvent.click(signIn);
    await screen.findByRole('alert');
    expect(authenticate).toHaveBeenCalledOnce(); expect(test.load).not.toHaveBeenCalled();
    expect(signIn.hasAttribute('disabled')).toBe(false);
  });
  it.each(['complete', 'redirect'] as const)('uses maintained sign-in outcome without premature native loading: %s', async outcome => {
    window.history.replaceState(null, '', '/?form=passport&package=%2Fpackage.json');
    const test = fixture();
    let signedIn = false;
    test.composition.browserAuthSession = { getSession: async () => signedIn
      ? { issuer: departmentAppProfile.identity.oidc!.issuer, subject: 'owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' } : null,
      subscribe: () => () => {}, } as never;
    const authenticate = vi.fn(async () => {
      if (outcome === 'redirect') { const error = new Error('Redirect started'); error.name = 'IdentityInteractionStartedError'; throw error; }
      signedIn = true;
      return {} as never;
    });
    test.composition.identityProvider = {
      discover: async () => [{ kind: 'oidc', issuer: departmentAppProfile.identity.oidc!.issuer, displayName: 'Applicant account', minAssurance: 'L2' }],
      authenticate, revoke: async () => {}, subscribe: () => () => {},
    };
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Applicant account' }));
    if (outcome === 'complete') await screen.findByTestId('native-route');
    else {
      const pending = await screen.findByRole('button', { name: 'Opening sign-in' });
      expect(pending.hasAttribute('disabled')).toBe(true);
      expect(test.load).not.toHaveBeenCalled(); expect(screen.queryByRole('alert')).toBeNull();
    }
    expect(authenticate).toHaveBeenCalledOnce();
  });
  it('ignores authentication completion after the native selection is unmounted', async () => {
    window.history.replaceState(null, '', '/?form=old&package=%2Fold.json');
    const test = fixture(); const gate = deferred<never>();
    test.composition.browserAuthSession = { getSession: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ subject: 'owner' }) } as never;
    test.composition.identityProvider = {
      discover: async () => [{ kind: 'oidc', issuer: departmentAppProfile.identity.oidc!.issuer, displayName: 'Applicant account', minAssurance: 'L2' }],
      authenticate: () => gate.promise, revoke: async () => {}, subscribe: () => () => {},
    };
    const mounted = render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Applicant account' }));
    mounted.unmount();
    rememberNativeSignInReturn(new URL('/?form=new&package=%2Fnew.json', window.location.href).href, departmentAppProfile);
    await act(async () => gate.resolve({} as never));
    expect(test.load).not.toHaveBeenCalled(); expect(screen.queryByTestId('native-route')).toBeNull();
    const oidc = departmentAppProfile.identity.oidc!;
    expect(createBrowserScopedMetadataStore({ namespace: 'formspec-web:signin-navigation',
      context: { origin: window.location.origin, issuer: oidc.issuer, clientId: oidc.clientId,
        redirectUri: oidc.redirectUri, tenantBinding: departmentAppProfile.tenantBinding } }).read('return')).toBe('/?form=new&package=%2Fnew.json');
  });
  it.each(['withdraw', 'replace', 'renew'] as const)('retires native review authority when the admitted OIDC session changes: %s', async change => {
    const test = fixture();
    const state = { issuer: 'https://idp.test', subject: 'owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    let notify!: (value: BrowserAuthSessionState | null) => void;
    const unsubscribe = vi.fn();
    test.boot.composition.browserAuthSession = {
      subscribe: (listener: (value: BrowserAuthSessionState | null) => void) => { notify = listener; listener(state); return unsubscribe; },
      getSession: async () => state, begin: async () => {}, completeCallback: async () => state,
      completeSilentCallback: async () => {}, renew: async () => state, logout: async () => {},
      completeLogoutCallback: async () => {}, accessToken: async () => 'fixture-bearer', dispose: () => {},
    };
    const mounted = render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByTestId('native-route');
    act(() => notify(change === 'withdraw' ? null : { ...state, ...(change === 'replace' ? { subject: 'other' } : { revision: 2 }) }));
    await screen.findByRole('heading', { name: 'Your sign-in session changed' });
    expect(screen.queryByTestId('native-route')).toBeNull(); expect(test.host.dispose).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    mounted.unmount();
  });
  it('refuses delayed recovery completion after the selected identity is withdrawn', async () => {
    const test = fixture(); const gate = deferred<'active'>();
    test.boot.resumeSubmitted = () => gate.promise;
    let notify!: (value: BrowserAuthSessionState | null) => void;
    test.boot.composition.browserAuthSession = { getSession: async () => ({ issuer: 'https://idp.test', subject: 'owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' }), subscribe: (listener: typeof notify) => {
      notify = listener; listener({ issuer: 'https://idp.test', subject: 'owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' });
      return () => {};
    } } as never;
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await waitFor(() => expect(notify).toBeDefined());
    act(() => notify(null));
    await screen.findByRole('heading', { name: 'Your sign-in session changed' });
    await act(async () => gate.resolve('active'));
    expect(screen.queryByTestId('native-route')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Your sign-in session changed' })).toBeTruthy();
    expect(test.host.dispose).toHaveBeenCalled();
  });
  it('awaits owner recovery on the widget-only route and renders a focused qualified receipt without ceremony', async () => {
    window.history.replaceState(null, '', '/review-sign?form=public-form&package=%2Fpackage.json');
    const test = fixture(); const gate = deferred<void>();
    test.boot.resumeSubmitted = vi.fn(async () => {
      await gate.promise;
      test.publish({ locale: 'es-US', submitted: { recordKind: 'response', referenceNumber: 'actual-response-id' } });
      return 'submitted' as const;
    });
    const print = vi.fn(); Object.defineProperty(window, 'print', { configurable: true, value: print });
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    expect(screen.queryByTestId('native-route')).toBeNull();
    await act(async () => gate.resolve());
    await screen.findByText('actual-response-id');
    const receipt = document.querySelector('.confirmation-panel');
    expect(document.activeElement).toBe(receipt);
    expect(screen.queryByTestId('native-route')).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit|Enviar/ })).toBeNull();
    const locale = localeDocuments.find(document => document.locale === 'es-US')!;
    expect(screen.getByRole('heading', { name: locale.strings['$ui.receipt.answersReceived'] })).toBeTruthy();
    expect(screen.queryByText(locale.strings['$ui.receipt.pendingFilingAndSigning'])).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: locale.strings['$ui.receipt.print'] }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: locale.strings['$ui.receipt.clear'] }));
    await screen.findByRole('heading', { name: locale.strings['$ui.receipt.clearedTitle'] });
    expect(test.host.clearDraftAccess).toHaveBeenCalledOnce();
  });
  it('refuses failed terminal qualification and disposes a cancelled preflight before mounting', async () => {
    const test = fixture(); test.boot.resumeSubmitted = async () => { throw new Error('private-state-mismatch'); };
    const mounted = render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByRole('alert'); expect(test.host.dispose).toHaveBeenCalled();
    expect(screen.queryByTestId('native-route')).toBeNull(); expect(screen.queryByText('private-state-mismatch')).toBeNull();
    mounted.unmount();
    const cancelled = fixture(); const gate = deferred<void>(); cancelled.boot.resumeSubmitted = async () => { await gate.promise; return 'absent'; };
    const pending = render(<NativePackageRuntime composition={cancelled.composition} config={departmentAppProfile} />);
    await waitFor(() => expect(cancelled.load).toHaveBeenCalled()); pending.unmount();
    await act(async () => gate.resolve()); expect(cancelled.host.dispose).toHaveBeenCalled();
    expect(screen.queryByTestId('native-route')).toBeNull();
  });
  it('logs only a bounded diagnostic for native assurance failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const test = fixture(); test.boot.resumeSubmitted = async () => {
        throw new NativePackageAdmissionError('identity', new OidcAssuranceError('unmapped-acr', '0', 'private-token-or-person'));
      };
      render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
      await screen.findByRole('alert');
      expect(warn).toHaveBeenCalledExactlyOnceWith('Native form admission failed', '{"stage":"identity","reason":"unmapped-acr","acr":"0"}');
      expect(screen.queryByText('private-token-or-person')).toBeNull(); expect(test.host.dispose).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });
  it('offers explicit maintained logout on identity refusal and retires the failed host on withdrawal', async () => {
    window.history.replaceState(null, '', '/?form=passport&package=%2Fpackage.json');
    const test = fixture();
    const current = { issuer: departmentAppProfile.identity.oidc!.issuer, subject: 'owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    let notify!: (value: BrowserAuthSessionState | null) => void;
    const logout = vi.fn(async () => { notify(null); throw new Error('private provider failure'); });
    test.composition.browserAuthSession = { getSession: async () => current, logout,
      subscribe: (listener: typeof notify) => { notify = listener; listener(current); return () => {}; } } as never;
    test.boot.resumeSubmitted = async () => { throw new NativePackageAdmissionError('identity', new OidcAssuranceError('unmapped-acr', '0', 'private')); };
    const config = { ...departmentAppProfile, identity: { ...departmentAppProfile.identity,
      oidc: { ...departmentAppProfile.identity.oidc!, postLogoutRedirectUri: '/auth/logout' } } };
    render(<NativePackageRuntime composition={test.composition} config={config} />);
    const signOut = await screen.findByRole('button', { name: 'Sign out and try again' });
    expect(logout).not.toHaveBeenCalled(); expect(test.host.dispose).toHaveBeenCalled();
    expect(screen.queryByTestId('native-route')).toBeNull();
    fireEvent.click(signOut);
    await screen.findByRole('heading', { name: 'Your sign-in session changed' });
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Return to form' }).getAttribute('href')).toBe('/?form=passport&package=%2Fpackage.json');
    expect(screen.queryByText('private provider failure')).toBeNull();
  });
  it('does not dispose a current cached owner when an obsolete StrictMode preflight rejects', async () => {
    const test = fixture(); const first = deferred<void>(); const second = deferred<void>();
    test.boot.resumeSubmitted = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    render(<StrictMode><NativePackageRuntime composition={test.composition} config={departmentAppProfile} /></StrictMode>);
    await waitFor(() => expect(test.boot.resumeSubmitted).toHaveBeenCalledTimes(2));
    await act(async () => first.reject(new Error('obsolete')));
    expect(test.host.dispose).not.toHaveBeenCalled();
    await act(async () => second.resolve());
    await screen.findByTestId('native-route'); expect(test.host.dispose).not.toHaveBeenCalled();
  });
  it.each(['absent', 'active'] as const)('guards %s startup on a state-dependent route until explicit authored-entry navigation', async outcome => {
    window.history.replaceState(null, '', '/review-sign?form=selected&package=%2Fpackage.json');
    const test = fixture(); test.boot.resumeSubmitted = async () => outcome;
    test.host.getStartupRoute = pathname => ({ entryHref: '/authored-start', entryTitle: 'Start form', requiresHostState: pathname !== '/authored-start' });
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    const link = await screen.findByRole('link', { name: 'Start form' });
    expect(link.getAttribute('href')).toBe('/authored-start?form=selected&package=%2Fpackage.json');
    expect(screen.queryByTestId('native-route')).toBeNull(); expect(observed.props).toBeUndefined();
    expect(screen.queryByText(UI_STRINGS['receipt.clearedDetail'])).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Passport renewal' }));
    act(() => { window.history.replaceState(null, '', link.getAttribute('href')!); window.dispatchEvent(new PopStateEvent('popstate')); });
    await screen.findByTestId('native-route'); expect(window.location.pathname).toBe('/authored-start');
    expect(test.boot.resumeSubmitted).toBeDefined(); expect(test.load).toHaveBeenCalledOnce();
  });
  it('shows a preparing status for genuinely owned pending delivery despite a stale absent boot outcome', async () => {
    window.history.replaceState(null, '', '/review-sign');
    const test = fixture(); test.boot.resumeSubmitted = async () => 'absent';
    test.host.getStartupRoute = () => ({ entryHref: '/start', entryTitle: 'Start form', requiresHostState: true });
    test.publish({ locale: 'es-US', controller: { phase: 'prepared', owned: true, prepared: {} } as NonNullable<ReturnType<NativePackageSigningHost['getSnapshot']>['controller']> });
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByRole('heading', { name: 'Renovación de pasaporte' });
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true'); expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('native-route')).toBeNull();
    act(() => test.publish({ runtime: {} as NonNullable<ReturnType<NativePackageSigningHost['getSnapshot']>['runtime']> }));
    await screen.findByTestId('native-route');
  });
  it('refuses an unavailable admitted entry once without mounting state-dependent widgets', async () => {
    window.history.replaceState(null, '', '/review-sign'); const test = fixture(); test.boot.resumeSubmitted = async () => 'absent';
    test.host.getStartupRoute = () => { throw new Error('entry-parameter-refusal'); };
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByRole('alert'); expect(screen.queryByTestId('native-route')).toBeNull(); expect(screen.queryByRole('link')).toBeNull();
  });
  it('keeps one package owner and selection query through authored navigation and browser history', async () => {
    window.history.replaceState(null, '', '/?form=public-form&package=%2Fpackage.json');
    const test = fixture(); render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByTestId('native-route');
    act(() => observed.props!.onNavigate('/review-sign'));
    expect(window.location.pathname).toBe('/review-sign'); expect(window.location.search).toBe('?form=public-form&package=%2Fpackage.json');
    expect(screen.getByTestId('native-route').textContent).toBe('/review-sign');
    act(() => { window.history.replaceState(null, '', '/?form=public-form&package=%2Fpackage.json'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByTestId('native-route').textContent).toBe('/'); expect(test.load).toHaveBeenCalledTimes(1);
    expect(() => observed.props!.onNavigate('https://outside.example/review-sign')).toThrow();
    expect(() => observed.props!.onNavigate('/review-sign?actor=untrusted')).toThrow();
  });
  it('uses authored bilingual labels, scoped Clear, and focuses the completed recovery heading', async () => {
    const test = fixture(); render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByTestId('native-route');
    fireEvent.click(screen.getByRole('button', { name: 'español (Estados Unidos)' }));
    await screen.findByRole('group', { name: 'Idioma' });
    expect(test.host.selectLocale).toHaveBeenCalledWith('es-US');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar el acceso guardado' }));
    const heading = await screen.findByRole('heading', { name: 'Acceso guardado borrado' });
    expect(document.activeElement).toBe(heading); expect(test.host.clearDraftAccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('native-route')).toBeNull();
    expect(screen.getByRole('link', { name: 'Renovación de pasaporte' }).getAttribute('href')).toBe('/');
  });
  it('refuses a missing or failed acquisition without exposing internal errors', async () => {
    const composition = createStubComposition();
    const mounted = render(<NativePackageRuntime composition={composition} config={departmentAppProfile} />);
    await screen.findByRole('alert');
    const test = fixture(); test.composition.nativePackageRespondent = { load: async () => { throw new Error('private-token'); } };
    mounted.rerender(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByRole('alert'); expect(screen.queryByText('private-token')).toBeNull();
  });
  it('disposes late old acquisition and never mounts it after a composition change', async () => {
    const old = fixture(); const next = fixture(); const loading = deferred<NativePackageBoot>();
    old.composition.nativePackageRespondent = { load: () => loading.promise };
    const mounted = render(<NativePackageRuntime composition={old.composition} config={departmentAppProfile} />);
    mounted.rerender(<NativePackageRuntime composition={next.composition} config={departmentAppProfile} />);
    await screen.findByTestId('native-route');
    await act(async () => { loading.resolve(old.boot); await loading.promise; });
    expect(old.host.dispose).toHaveBeenCalledTimes(1); expect(next.host.dispose).not.toHaveBeenCalled();
  });
  it('retains the cached acquisition across StrictMode replay and releases it on final unmount', async () => {
    const test = fixture(); const mounted = render(<StrictMode><NativePackageRuntime composition={test.composition} config={departmentAppProfile} /></StrictMode>);
    await screen.findByTestId('native-route'); expect(test.host.dispose).not.toHaveBeenCalled();
    mounted.unmount(); await waitFor(() => expect(test.host.dispose).toHaveBeenCalledTimes(1));
  });
  it('reacquires changed browser selection while preserving the owner across same-selection routes', async () => {
    const first = fixture(); const second = fixture();
    observed.choose.mockImplementation(({ href }: { href: string }) => new URL(href).searchParams.get('form') === 'first' ? first.composition : second.composition);
    window.history.replaceState(null, '', '/?form=first&package=%2Ffirst.json');
    render(<NativePackageRoot config={departmentAppProfile} />);
    await screen.findByTestId('native-route');
    act(() => { window.history.replaceState(null, '', '/review-sign?form=first&package=%2Ffirst.json'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(first.load).toHaveBeenCalledTimes(1); expect(observed.choose).toHaveBeenCalledTimes(1);
    act(() => { window.history.replaceState(null, '', '/?form=second&package=%2Fsecond.json'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(second.load).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.host.dispose).toHaveBeenCalledTimes(1));
    expect(new URL(observed.choose.mock.calls.at(-1)![0].href).pathname).toBe('/');
  });
  it('keeps a fenced failed Clear hidden, retries scoped deletion, then focuses completion', async () => {
    const test = fixture(); const original = vi.mocked(test.host.clearDraftAccess).getMockImplementation()!;
    vi.mocked(test.host.clearDraftAccess).mockImplementationOnce(async () => { await original(); throw new Error('delete-unavailable'); });
    render(<NativePackageRuntime composition={test.composition} config={departmentAppProfile} />);
    await screen.findByTestId('native-route');
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access' }));
    await screen.findByRole('alert'); expect(screen.queryByTestId('native-route')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved access' }));
    const heading = await screen.findByRole('heading', { name: 'Saved access cleared' });
    expect(document.activeElement).toBe(heading); expect(test.host.clearDraftAccess).toHaveBeenCalledTimes(2);
  });

});
