import { stubScreenerDocumentSource } from '../../src/adapters/stub/screener-document-source.ts';
import * as mainHelpers from '../../src/app/main-helpers.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/app/App.tsx';
import { CompositionProvider } from '../../src/app/CompositionProvider.tsx';
import { navigateAppRoute } from '../../src/app/route-transition.ts';
import { useRoutedComposition } from '../../src/app/routed-composition.ts';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('App route selection (FW-0039 slice 1)', () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    setHref('http://localhost/');
  });

  afterEach(() => {
    setHref(originalHref);
    cleanup();
    vi.restoreAllMocks();
  });

  it('routes / to the form runtime (existing default)', async () => {
    setHref('http://localhost/');
    const composition = createTestComposition({ definition: testDefinition });
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: testDefinition.title, level: 1 }),
      ).not.toBeNull();
    });
  });

  it('routes /status?case=urn:wos:... to the status runtime', async () => {
    setHref('http://localhost/status?case=urn:wos:case_demo_000001');
    const composition = createTestComposition({ definition: testDefinition });
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
    const composition = createTestComposition({ definition: testDefinition });
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
    const composition = createTestComposition({ definition: testDefinition });
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

  it('routes /history to the history runtime (FW-0057 slice 1)', async () => {
    setHref('http://localhost/history');
    const composition = createTestComposition({ definition: testDefinition });
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Your history/i, level: 1 }),
      ).not.toBeNull();
    });
  });

  it('routes /screener?doc=URN to the screener runtime (FW-0046 slice 1)', async () => {
    setHref('http://localhost/screener?doc=urn:test:screener');
    const composition = createTestComposition({ definition: testDefinition, screenerDocumentSource: stubScreenerDocumentSource([{
      $formspecScreener: '1.0', url: 'urn:test:screener', version: '1.0.0', title: 'Which form is right for you?',
      targetDefinition: { url: testDefinition.url }, items: [], evaluation: [{ id: 'routing', strategy: 'first-match', routes: [{ condition: 'true', target: testDefinition.url }] }],
    }]) });
    render(
      <CompositionProvider value={composition}>
        <App config={departmentAppProfile} />
      </CompositionProvider>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Which form is right for you\?/i, level: 1 }),
      ).not.toBeNull();
    });
  });

  it('explicit route transitions recompute composition and mounted runtime', async () => {
    setHref('http://localhost:3000/');
    const choose = vi.spyOn(mainHelpers, 'chooseComposition').mockImplementation(() =>
      createTestComposition({ definition: testDefinition }));
    render(<RoutedAppHarness />);
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: testDefinition.title, level: 1 }),
      ).not.toBeNull();
    });

    await act(async () => {
      navigateAppRoute('/status?case=urn:wos:case_demo_000001');
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Your application status/i, level: 1 }),
      ).not.toBeNull();
    });
    expect(screen.queryByRole('heading', { name: testDefinition.title, level: 1 })).toBeNull();
    expect(choose).toHaveBeenCalledTimes(2);
    expect(choose.mock.calls[1][0].href).toContain('/status?case=');
  });
});

function RoutedAppHarness() {
  const routeState = useRoutedComposition(departmentAppProfile);
  if (routeState.status === 'form-route-error') {
    return <div role="alert">{routeState.error.code}</div>;
  }
  return (
    <CompositionProvider value={routeState.composition}>
      <App config={departmentAppProfile} href={routeState.href} />
    </CompositionProvider>
  );
}

function setHref(href: string): void {
  const url = new URL(href, window.location.href);
  const sameOriginUrl = new URL(`${url.pathname}${url.search}${url.hash}`, window.location.origin);
  window.history.replaceState(null, '', sameOriginUrl);
}
