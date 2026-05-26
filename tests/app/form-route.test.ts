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
