export type RootFormRouteSelection =
  | { kind: 'default' }
  | { kind: 'selected'; initialDefinitionUrl: string };

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
  if (formValues.length === 0) {
    return { kind: 'default' };
  }
  if (formValues.length > 1) {
    throw new AmbiguousFormRouteError(formValues);
  }

  const [initialDefinitionUrl] = formValues;
  if (!initialDefinitionUrl || initialDefinitionUrl.trim().length === 0) {
    throw new InvalidFormRouteError('The form route parameter is empty.');
  }

  return { kind: 'selected', initialDefinitionUrl };
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
