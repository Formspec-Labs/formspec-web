import type { SubmitTransport } from '../../ports/submit-transport.ts';
import { notForStatusRouteError } from './_error.ts';

export function noopSubmitTransport(): SubmitTransport {
  return {
    async submit() {
      throw notForStatusRouteError('SubmitTransport');
    },
  };
}
