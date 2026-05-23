import type { StatusReader, StatusRequest } from '../../ports/status-reader.ts';

export function unavailableStatusReader(
  message = 'Applicant status adapter is not configured for this deployment.',
): StatusReader {
  return {
    async readStatus(_request: StatusRequest) {
      throw new Error(message);
    },
  };
}
