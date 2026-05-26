import type { ResponseActionInvoker, SubmitResult } from '@formspec-org/react';
import type { FormDefinition } from './definition-source.ts';
import type { DraftKey } from './draft-store.ts';
import type { IdentityClaim } from './identity-provider.ts';

/**
 * Host factory for Response Actions runtime invocation.
 *
 * The component tree still calls the upstream engine executor. This seam lets
 * a trusted composition wrap that executor with durable host plumbing, such as
 * a route-backed Ledger append, without putting server secrets in browser code.
 */
export type ResponseActionInvokerFactory = (
  context: ResponseActionRuntimeContext,
) => ResponseActionInvoker<SubmitResult> | null;

export interface ResponseActionRuntimeContext {
  /** The URL used to load the runtime payload; reference HTTP adapters derive form_id from this. */
  runtimeDefinitionUrl: string;
  /** Canonical Definition loaded from the runtime payload. */
  definition: FormDefinition;
  /** Active draft scope for the respondent/session. */
  draftKey: DraftKey;
  /** Current respondent identity claim, if any. */
  claim: IdentityClaim | null;
}
