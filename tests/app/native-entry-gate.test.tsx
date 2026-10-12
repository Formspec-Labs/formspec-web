import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativePackageBoot } from '../../src/composition/native-package.ts';
import type { Composition } from '../../src/composition/types.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';
import { NativePackageRuntime } from '../../src/app/NativePackageRuntime.tsx';

afterEach(cleanup);
describe('native entry gate before destination mount', () => {
  it.each([false, true])('shows the entry action with prepared saved draft=%s and never mounts destination', async prepared => {
    window.history.replaceState(null, '', '/destination');
    const snapshot = { locale: 'en', formTitle: 'Example form', sessionGeneration: 1, cleared: false,
      ...(prepared ? { controller: { phase: 'prepared', prepared: { draft: { id: 'saved' } } } } : {}) };
    const host = { subscribe: () => () => {}, getSnapshot: () => snapshot, dispose: vi.fn(),
      definition: { $formspec: '1.0', url: 'urn:test:form', version: '1', items: [] }, moduleId: 'generic-test',
      getStartupRoute: () => ({ entryHref: '/check', entryTitle: 'Check eligibility', requiresHostState: false, requiresScreener: true }) };
    const composition = {} as Composition;
    const boot = { host, composition, localeDocuments: [], initialLocale: 'en' } as unknown as NativePackageBoot;
    composition.nativePackageRespondent = { load: async () => boot };
    const config = publicPortalProfile;
    render(<NativePackageRuntime composition={composition} config={config} />);
    const entry = await screen.findByRole('link', { name: 'Check eligibility' });
    expect(entry.getAttribute('href')).toBe('/check');
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('false');
    expect(host.dispose).not.toHaveBeenCalled();
  });
});
