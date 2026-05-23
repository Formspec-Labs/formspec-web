import type {
  ApplicantStatusResource,
  StatusReader,
  StatusRequest,
} from '../../ports/status-reader.ts';
import { isApplicantStatusResource } from '../../shared/respondent-place.ts';

export function stubStatusReader(
  initialRecords: Iterable<readonly [string, ApplicantStatusResource]> = [],
): StatusReader & {
  registerStatus(key: string, resource: ApplicantStatusResource): void;
} {
  const records = new Map<string, ApplicantStatusResource>();
  for (const [key, resource] of initialRecords) {
    assertApplicantStatusResource(resource);
    records.set(key, cloneJson(resource));
  }

  return {
    registerStatus(key, resource) {
      assertApplicantStatusResource(resource);
      records.set(key, cloneJson(resource));
    },
    async readStatus(request: StatusRequest) {
      const key = request.resourceRef ?? request.submissionId ?? request.trackingUri;
      return key ? cloneJson(records.get(key)) : undefined;
    },
  };
}

function assertApplicantStatusResource(value: unknown): asserts value is ApplicantStatusResource {
  if (!isApplicantStatusResource(value)) {
    throw new Error('stub StatusReader: invalid WOS applicant API resource');
  }
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
