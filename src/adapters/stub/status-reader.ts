import type {
  ApplicantStatusProjection,
  StatusReader,
  StatusRequest,
} from '../../ports/status-reader.ts';
import { isApplicantStatusProjection } from '../../shared/respondent-place.ts';

export function stubStatusReader(
  initialRecords: Iterable<ApplicantStatusProjection> = [],
): StatusReader & {
  registerStatus(key: string, projection: ApplicantStatusProjection): void;
} {
  const records = new Map<string, ApplicantStatusProjection>();
  for (const record of initialRecords) {
    if (record.resourceRef) {
      records.set(record.resourceRef, cloneJson(record));
    }
  }

  return {
    registerStatus(key, projection) {
      assertApplicantStatusProjection(projection);
      records.set(key, cloneJson(projection));
    },
    async readStatus(request: StatusRequest) {
      const key = request.resourceRef ?? request.submissionId ?? request.trackingUri;
      return key ? cloneJson(records.get(key)) : undefined;
    },
  };
}

function assertApplicantStatusProjection(value: unknown): asserts value is ApplicantStatusProjection {
  if (!isApplicantStatusProjection(value)) {
    throw new Error('stub StatusReader: invalid WOS applicant status projection');
  }
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
