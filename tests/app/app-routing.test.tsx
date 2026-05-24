import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/app/App.tsx';
import { CompositionProvider } from '../../src/app/CompositionProvider.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('App route selection (FW-0039 slice 1)', () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    setHref('http://localhost/');
  });

  afterEach(() => {
    setHref(originalHref);
    cleanup();
  });

  it('routes / to the form runtime (existing default)', async () => {
    setHref('http://localhost/');
    const composition = createStubComposition();
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Demo Benefits Intake/i, level: 1 }),
      ).not.toBeNull();
    });
  });

  it('routes /status?case=urn:wos:... to the status runtime', async () => {
    setHref('http://localhost/status?case=urn:wos:case_demo_000001');
    const composition = createStubComposition();
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Your application status/i, level: 1 }),
      ).not.toBeNull();
    });
  });

  it('routes /obligations to the obligations runtime (FW-0055 slice 1)', async () => {
    setHref('http://localhost/obligations');
    const composition = createStubComposition();
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /What you owe/i, level: 1 }),
      ).not.toBeNull();
    });
  });

  it('routes /documents to the documents runtime (FW-0056 slice 1)', async () => {
    setHref('http://localhost/documents');
    const composition = createStubComposition();
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Your documents/i, level: 1 }),
      ).not.toBeNull();
    });
  });
});

function setHref(href: string): void {
  const url = new URL(href);
  // happy-dom honours direct property writes on location for pathname/search.
  // Using Object.defineProperty avoids navigating in the harness.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...window.location,
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      origin: url.origin,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      protocol: url.protocol,
      hash: url.hash,
    },
  });
}
