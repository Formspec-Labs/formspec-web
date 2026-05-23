export interface ProblemJson {
  type: string;
  title: string;
  status: number;
  error_code: string;
  detail?: string;
  instance?: string;
  context?: Record<string, unknown>;
}

export function isProblemJson(value: unknown): value is ProblemJson {
  if (!isRecord(value)) {
    return false;
  }
  const status = value.status;
  return (
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599 &&
    typeof value.error_code === 'string' &&
    /^[A-Z]+-\d{4}$/.test(value.error_code) &&
    !('code' in value)
  );
}

export function assertProblemJson(value: unknown): asserts value is ProblemJson {
  if (!isProblemJson(value)) {
    throw new Error('Expected stack-common Problem JSON with required error_code');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
