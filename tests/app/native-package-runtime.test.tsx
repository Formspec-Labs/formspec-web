import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import type { ComponentDocument, LocaleDocument } from '@formspec-org/types';
import { NativePackageRoot, NativePackageRuntime } from '../../src/app/NativePackageRuntime.tsx';
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
afterEach(() => { cleanup(); observed.props = undefined; observed.choose.mockReset(); window.history.replaceState(null, '', '/'); });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function fixture() {
  let state: Partial<ReturnType<NativePackageSigningHost['getSnapshot']>> = { generation: 1, locale: 'en', cleared: false, controller: {} as NonNullable<ReturnType<NativePackageSigningHost['getSnapshot']>['controller']>, runtime: undefined };
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const host = {
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
  it('awaits owner recovery on the widget-only route and renders a focused qualified receipt without ceremony', async () => {
    window.history.replaceState(null, '', '/review-sign?form=public-form&package=%2Fpackage.json');
    const test = fixture(); const gate = deferred<void>();
    test.boot.resumeSubmitted = vi.fn(async () => {
      await gate.promise;
      test.publish({ locale: 'es-US', submitted: { recordKind: 'response', referenceNumber: 'actual-response-id' } });
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
    const cancelled = fixture(); const gate = deferred<void>(); cancelled.boot.resumeSubmitted = () => gate.promise;
    const pending = render(<NativePackageRuntime composition={cancelled.composition} config={departmentAppProfile} />);
    await waitFor(() => expect(cancelled.load).toHaveBeenCalled()); pending.unmount();
    await act(async () => gate.resolve()); expect(cancelled.host.dispose).toHaveBeenCalled();
    expect(screen.queryByTestId('native-route')).toBeNull();
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
    expect(screen.getByRole('link', { name: 'Borrar el acceso guardado y empezar de nuevo' }).getAttribute('href')).toBe('/');
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
