import { describe, expect, it } from 'vitest';
import { createBrowserSurfaceRouter } from '../../src/adapters/browser/surface-router.ts';
import { FORMSPEC_ROUTE_TRANSITION_EVENT } from '../../src/app/route-transition.ts';

describe('browser Surface router', () => {
  it('advances only after a completed action on the matching Surface identity and route', () => {
    window.history.replaceState(
      {},
      '',
      [
        '/?form=https%3A%2F%2Fserver.example.test%2Fruntime%2Fforms%2Fdemo',
        'response=response_route_param_1',
        'surface=https%3A%2F%2Fsurfaces.example.test%2Fintake',
        'surfaceVersion=1.0.0',
        'surfaceRoute=apply',
        'surfaceNextRoute=confirmation',
        'surfaceTriggerAction=submit',
      ].join('&'),
    );
    const router = createBrowserSurfaceRouter({
      surfaceUrl: 'https://surfaces.example.test/intake',
      surfaceVersion: '1.0.0',
      routeId: 'apply',
      nextRouteId: 'confirmation',
      triggerActionId: 'submit',
    });
    let transitionEvents = 0;
    window.addEventListener(FORMSPEC_ROUTE_TRANSITION_EVENT, () => {
      transitionEvents += 1;
    });

    router.transitionAfterResponseAction({
      actionId: 'submit',
      status: 'blocked',
      componentGraph: {
        component: {
          handle: 'respondent',
          url: 'https://components.example.test/respondent',
          version: '1.0.0',
        },
        surface: {
          url: 'https://surfaces.example.test/intake',
          version: '1.0.0',
        },
        route: 'apply',
      },
    });
    expect(new URL(window.location.href).searchParams.get('surfaceRoute')).toBe('apply');
    expect(transitionEvents).toBe(0);

    router.transitionAfterResponseAction({
      actionId: 'submit',
      status: 'completed',
      componentGraph: {
        component: {
          handle: 'respondent',
          url: 'https://components.example.test/respondent',
          version: '1.0.0',
        },
        surface: {
          url: 'https://surfaces.example.test/intake',
          version: '1.0.0',
        },
        route: 'apply',
      },
    });
    const url = new URL(window.location.href);
    expect(url.searchParams.get('surfaceRoute')).toBe('confirmation');
    expect(url.searchParams.get('surfaceNextRoute')).toBeNull();
    expect(url.searchParams.get('surfaceTriggerAction')).toBeNull();
    expect(url.searchParams.get('response')).toBe('response_route_param_1');
    expect(window.history.state).toMatchObject({
      formspecInternalSurfaceRoute: true,
      formspecSurface: 'https://surfaces.example.test/intake',
      formspecSurfaceVersion: '1.0.0',
      formspecFromRoute: 'apply',
      formspecRoute: 'confirmation',
      formspecTriggerAction: 'submit',
    });
    expect(transitionEvents).toBe(0);
  });

  it('does not advance when the completed action is not the declared Surface trigger', () => {
    window.history.replaceState(
      {},
      '',
      [
        '/?form=demo',
        'surface=https%3A%2F%2Fsurfaces.example.test%2Fintake',
        'surfaceRoute=apply',
        'surfaceNextRoute=confirmation',
        'surfaceTriggerAction=submit',
      ].join('&'),
    );
    const router = createBrowserSurfaceRouter({
      surfaceUrl: 'https://surfaces.example.test/intake',
      routeId: 'apply',
      nextRouteId: 'confirmation',
      triggerActionId: 'submit',
    });

    router.transitionAfterResponseAction({
      actionId: 'save-draft',
      status: 'completed',
      componentGraph: {
        component: {
          handle: 'respondent',
          url: 'https://components.example.test/respondent',
          version: '1.0.0',
        },
        surface: {
          url: 'https://surfaces.example.test/intake',
        },
        route: 'apply',
      },
    });

    expect(new URL(window.location.href).searchParams.get('surfaceRoute')).toBe('apply');
  });

  it('does not advance when the Component graph belongs to another Surface route', () => {
    window.history.replaceState(
      {},
      '',
      '/?form=demo&surface=https%3A%2F%2Fsurfaces.example.test%2Fintake&surfaceRoute=apply&surfaceNextRoute=confirmation&surfaceTriggerAction=submit',
    );
    const router = createBrowserSurfaceRouter({
      surfaceUrl: 'https://surfaces.example.test/intake',
      routeId: 'apply',
      nextRouteId: 'confirmation',
      triggerActionId: 'submit',
    });

    router.transitionAfterResponseAction({
      actionId: 'submit',
      status: 'completed',
      componentGraph: {
        component: {
          handle: 'respondent',
          url: 'https://components.example.test/respondent',
          version: '1.0.0',
        },
        surface: {
          url: 'https://surfaces.example.test/intake',
        },
        route: 'review',
      },
    });

    expect(new URL(window.location.href).searchParams.get('surfaceRoute')).toBe('apply');
  });

  it('does not advance when the Component graph belongs to another Surface URL', () => {
    window.history.replaceState(
      {},
      '',
      '/?form=demo&surface=https%3A%2F%2Fsurfaces.example.test%2Fintake&surfaceRoute=apply&surfaceNextRoute=confirmation&surfaceTriggerAction=submit',
    );
    const router = createBrowserSurfaceRouter({
      surfaceUrl: 'https://surfaces.example.test/intake',
      routeId: 'apply',
      nextRouteId: 'confirmation',
      triggerActionId: 'submit',
    });

    router.transitionAfterResponseAction({
      actionId: 'submit',
      status: 'completed',
      componentGraph: {
        component: {
          handle: 'respondent',
          url: 'https://components.example.test/respondent',
          version: '1.0.0',
        },
        surface: {
          url: 'https://surfaces.example.test/other',
        },
        route: 'apply',
      },
    });

    expect(new URL(window.location.href).searchParams.get('surfaceRoute')).toBe('apply');
  });

  it('does not advance when the Component graph belongs to another Surface version', () => {
    window.history.replaceState(
      {},
      '',
      '/?form=demo&surface=https%3A%2F%2Fsurfaces.example.test%2Fintake&surfaceVersion=1.0.0&surfaceRoute=apply&surfaceNextRoute=confirmation&surfaceTriggerAction=submit',
    );
    const router = createBrowserSurfaceRouter({
      surfaceUrl: 'https://surfaces.example.test/intake',
      surfaceVersion: '1.0.0',
      routeId: 'apply',
      nextRouteId: 'confirmation',
      triggerActionId: 'submit',
    });

    router.transitionAfterResponseAction({
      actionId: 'submit',
      status: 'completed',
      componentGraph: {
        component: {
          handle: 'respondent',
          url: 'https://components.example.test/respondent',
          version: '1.0.0',
        },
        surface: {
          url: 'https://surfaces.example.test/intake',
          version: '2.0.0',
        },
        route: 'apply',
      },
    });

    expect(new URL(window.location.href).searchParams.get('surfaceRoute')).toBe('apply');
  });
});
