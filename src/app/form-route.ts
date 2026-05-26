export type RootFormRouteSelection =
  | { kind: 'default' }
  | {
      kind: 'selected';
      initialDefinitionUrl: string;
      selectedResponseId?: string;
      surfaceRoute?: RootSurfaceRouteState;
    };

export interface RootSurfaceRouteState {
  surfaceUrl: string;
  surfaceVersion?: string;
  routeId: string;
  nextRouteId?: string;
  triggerActionId?: string;
}

export class AmbiguousFormRouteError extends Error {
  readonly code = 'FORM_ROUTE_AMBIGUOUS';
  readonly formValues: readonly string[];

  constructor(formValues: readonly string[]) {
    super('The form route is ambiguous because it names more than one form.');
    this.name = 'AmbiguousFormRouteError';
    this.formValues = [...formValues];
  }
}

export class InvalidFormRouteError extends Error {
  readonly code = 'FORM_ROUTE_INVALID';

  constructor(message = 'The form route parameter is invalid.') {
    super(message);
    this.name = 'InvalidFormRouteError';
  }
}

export type FormRouteError = AmbiguousFormRouteError | InvalidFormRouteError;

export function parseRootFormRoute(href: string): RootFormRouteSelection | null {
  const url = new URL(href, 'https://formspec.local');
  if (url.pathname !== '/') {
    return null;
  }

  const formValues = url.searchParams.getAll('form');
  const responseValues = url.searchParams.getAll('response');
  const surfaceValues = url.searchParams.getAll('surface');
  const surfaceVersionValues = url.searchParams.getAll('surfaceVersion');
  const surfaceRouteValues = url.searchParams.getAll('surfaceRoute');
  const surfaceNextRouteValues = url.searchParams.getAll('surfaceNextRoute');
  const surfaceTriggerActionValues = url.searchParams.getAll('surfaceTriggerAction');
  if (formValues.length === 0) {
    if (responseValues.length > 0) {
      throw new InvalidFormRouteError('The response route parameter requires a form parameter.');
    }
    return { kind: 'default' };
  }
  if (formValues.length > 1) {
    throw new AmbiguousFormRouteError(formValues);
  }
  assertSingleOptionalParam(responseValues, 'response');
  assertSingleOptionalParam(surfaceValues, 'surface');
  assertSingleOptionalParam(surfaceVersionValues, 'surfaceVersion');
  assertSingleOptionalParam(surfaceRouteValues, 'surfaceRoute');
  assertSingleOptionalParam(surfaceNextRouteValues, 'surfaceNextRoute');
  assertSingleOptionalParam(surfaceTriggerActionValues, 'surfaceTriggerAction');

  const [initialDefinitionUrl] = formValues;
  if (!initialDefinitionUrl || initialDefinitionUrl.trim().length === 0) {
    throw new InvalidFormRouteError('The form route parameter is empty.');
  }

  const selectedResponseId = optionalNonEmptyParam(responseValues, 'response');
  return {
    kind: 'selected',
    initialDefinitionUrl,
    ...(selectedResponseId ? { selectedResponseId } : {}),
    ...surfaceRouteState({
      surface: surfaceValues,
      surfaceVersion: surfaceVersionValues,
      surfaceRoute: surfaceRouteValues,
      surfaceNextRoute: surfaceNextRouteValues,
      surfaceTriggerAction: surfaceTriggerActionValues,
    }),
  };
}

export function formRouteErrorCopy(error: FormRouteError): string {
  if (error instanceof AmbiguousFormRouteError) {
    return 'This link names more than one form. Open a link that names exactly one form.';
  }
  return 'This link does not name a valid form. Open a link that names exactly one form.';
}

export function isFormRouteError(error: unknown): error is FormRouteError {
  return error instanceof AmbiguousFormRouteError || error instanceof InvalidFormRouteError;
}

function assertSingleOptionalParam(values: readonly string[], name: string): void {
  if (values.length > 1) {
    throw new InvalidFormRouteError(`The ${name} route parameter must appear at most once.`);
  }
}

function optionalNonEmptyParam(values: readonly string[], name: string): string | undefined {
  const value = values[0];
  if (value === undefined) return undefined;
  if (value.trim().length === 0) {
    throw new InvalidFormRouteError(`The ${name} route parameter is empty.`);
  }
  return value;
}

function surfaceRouteState(values: {
  surface: readonly string[];
  surfaceVersion: readonly string[];
  surfaceRoute: readonly string[];
  surfaceNextRoute: readonly string[];
  surfaceTriggerAction: readonly string[];
}): { surfaceRoute?: RootSurfaceRouteState } {
  const hasAnySurfaceParam =
    values.surface.length > 0 ||
    values.surfaceVersion.length > 0 ||
    values.surfaceRoute.length > 0 ||
    values.surfaceNextRoute.length > 0 ||
    values.surfaceTriggerAction.length > 0;
  if (!hasAnySurfaceParam) return {};

  const surfaceUrl = optionalNonEmptyParam(values.surface, 'surface');
  const routeId = optionalNonEmptyParam(values.surfaceRoute, 'surfaceRoute');
  if (!surfaceUrl || !routeId) {
    throw new InvalidFormRouteError(
      'Surface route state requires surface and surfaceRoute parameters.',
    );
  }
  const surfaceVersion = optionalNonEmptyParam(values.surfaceVersion, 'surfaceVersion');
  const nextRouteId = optionalNonEmptyParam(values.surfaceNextRoute, 'surfaceNextRoute');
  const triggerActionId = optionalNonEmptyParam(
    values.surfaceTriggerAction,
    'surfaceTriggerAction',
  );
  if ((nextRouteId && !triggerActionId) || (triggerActionId && !nextRouteId)) {
    throw new InvalidFormRouteError(
      'Surface route transitions require surfaceNextRoute and surfaceTriggerAction parameters.',
    );
  }
  return {
    surfaceRoute: {
      surfaceUrl,
      ...(surfaceVersion ? { surfaceVersion } : {}),
      routeId,
      ...(nextRouteId ? { nextRouteId } : {}),
      ...(triggerActionId ? { triggerActionId } : {}),
    },
  };
}
