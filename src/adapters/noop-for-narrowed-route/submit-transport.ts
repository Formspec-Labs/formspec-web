import type { SubmitTransport } from '../../ports/submit-transport.ts';
import { notForNarrowedRouteError } from './_error.ts';

export function noopSubmitTransport(routeCite?: string): SubmitTransport {
  return {
    async submit() {
      throw notForNarrowedRouteError('SubmitTransport', routeCite);
    },
  };
}
