import type { StatusReader, StatusRequest } from '../../ports/status-reader.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableStatusReader(
  message = 'Applicant status adapter is not configured for this deployment.',
): StatusReader {
  const adapter: StatusReader = {
    async readStatus(_request: StatusRequest) {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'status',
    reason: message,
  });
}
