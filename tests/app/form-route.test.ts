import { describe, expect, it } from 'vitest';
import {
  AmbiguousFormRouteError,
  InvalidFormRouteError,
  formRouteErrorCopy,
  parseRootFormRoute,
} from '../../src/app/form-route.ts';

describe('root form route parser', () => {
  it('returns the default full-app route when the root URL has no form parameter', () => {
    expect(parseRootFormRoute('https://forms.example.test/')).toEqual({ kind: 'default' });
  });

  it('binds a single form parameter as the selected runtime Definition URL', () => {
    const runtimeDefinitionUrl =
      'https://formspec-server.example.test/runtime/forms/demo-benefits-intake-live';

    expect(
      parseRootFormRoute(
        `https://forms.example.test/?form=${encodeURIComponent(runtimeDefinitionUrl)}`,
      ),
    ).toEqual({
      kind: 'selected',
      initialDefinitionUrl: runtimeDefinitionUrl,
    });
  });

  it('binds an explicit response parameter as selected Response instance route state', () => {
    const runtimeDefinitionUrl =
      'https://formspec-server.example.test/runtime/forms/demo-benefits-intake-live';

    expect(
      parseRootFormRoute(
        `https://forms.example.test/?form=${encodeURIComponent(runtimeDefinitionUrl)}&response=response_route_param_1`,
      ),
    ).toEqual({
      kind: 'selected',
      initialDefinitionUrl: runtimeDefinitionUrl,
      selectedResponseId: 'response_route_param_1',
    });
  });

  it('binds explicit Surface route state separately from selected Definition and Response state', () => {
    const runtimeDefinitionUrl =
      'https://formspec-server.example.test/runtime/forms/demo-benefits-intake-live';
    const surfaceUrl = 'https://surfaces.example.test/intake-live';

    expect(
      parseRootFormRoute(
        [
          `https://forms.example.test/?form=${encodeURIComponent(runtimeDefinitionUrl)}`,
          `response=response_route_param_1`,
          `surface=${encodeURIComponent(surfaceUrl)}`,
          'surfaceVersion=1.0.0',
          'surfaceRoute=apply',
          'surfaceNextRoute=confirmation',
          'surfaceTriggerAction=submit',
        ].join('&'),
      ),
    ).toEqual({
      kind: 'selected',
      initialDefinitionUrl: runtimeDefinitionUrl,
      selectedResponseId: 'response_route_param_1',
      surfaceRoute: {
        surfaceUrl,
        surfaceVersion: '1.0.0',
        routeId: 'apply',
        nextRouteId: 'confirmation',
        triggerActionId: 'submit',
      },
    });
  });

  it('binds relative root URLs from in-app links', () => {
    expect(parseRootFormRoute('/?form=demo-intake')).toEqual({
      kind: 'selected',
      initialDefinitionUrl: 'demo-intake',
    });
  });

  it('returns null for non-root routes so narrowed routes keep their own parsers', () => {
    expect(parseRootFormRoute('https://forms.example.test/status?form=demo-intake')).toBeNull();
  });

  it('rejects duplicate form parameters as an ambiguous route before runtime state is created', () => {
    expect(() =>
      parseRootFormRoute('https://forms.example.test/?form=demo-intake&form=renewal-intake'),
    ).toThrow(AmbiguousFormRouteError);
  });

  it('rejects duplicate response parameters instead of choosing a Response by convention', () => {
    expect(() =>
      parseRootFormRoute('https://forms.example.test/?form=demo-intake&response=a&response=b'),
    ).toThrow(InvalidFormRouteError);
  });

  it('rejects response parameters without a selected form route', () => {
    expect(() => parseRootFormRoute('https://forms.example.test/?response=response-1')).toThrow(
      InvalidFormRouteError,
    );
  });

  it('rejects incomplete Surface route state', () => {
    expect(() =>
      parseRootFormRoute('https://forms.example.test/?form=demo-intake&surfaceRoute=apply'),
    ).toThrow(InvalidFormRouteError);
  });

  it('rejects Surface transition state without an explicit trigger action', () => {
    expect(() =>
      parseRootFormRoute(
        'https://forms.example.test/?form=demo-intake&surface=https%3A%2F%2Fsurfaces.example.test%2Fintake&surfaceRoute=apply&surfaceNextRoute=confirmation',
      ),
    ).toThrow(InvalidFormRouteError);
  });

  it('rejects Surface trigger state without an explicit next route', () => {
    expect(() =>
      parseRootFormRoute(
        'https://forms.example.test/?form=demo-intake&surface=https%3A%2F%2Fsurfaces.example.test%2Fintake&surfaceRoute=apply&surfaceTriggerAction=submit',
      ),
    ).toThrow(InvalidFormRouteError);
  });

  it('rejects an empty form parameter instead of silently falling back to the default form', () => {
    expect(() => parseRootFormRoute('https://forms.example.test/?form=')).toThrow(
      InvalidFormRouteError,
    );
  });

  it('exposes plain-language boot-error copy for route failures', () => {
    expect(formRouteErrorCopy(new AmbiguousFormRouteError(['a', 'b']))).toMatch(
      /more than one form/,
    );
    expect(formRouteErrorCopy(new InvalidFormRouteError())).toMatch(/valid form/);
  });
});
