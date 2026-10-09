import type { InstanceSourceResolver } from '@formspec-org/engine/render';
import type { HydratedScreenerCandidate } from '../ports/screener-hydration.ts';

/** One frozen saved-candidate context, shared by renderer and isolated engines. No URL fallback. */
export function createEvaluationInstanceResolver(context: HydratedScreenerCandidate): InstanceSourceResolver {
  const { view } = context;
  const assertCurrent = context.assertCurrent.bind(context);
  return async (request, options) => {
    options.signal.throwIfAborted(); assertCurrent();
    if (!request.readonly || request.definition.url !== view.selection.definitionUrl
      || request.definition.version !== view.selection.definitionVersion
      || !Object.hasOwn(view.sources, request.instanceName) || view.sources[request.instanceName] !== request.source) {
      return { status: 'unavailable', reason: 'evaluation-source-unselected' };
    }
    const result = view.results.find(result => result.instanceName === request.instanceName && result.sourceRef === request.source);
    if (!result || result.status !== 'qualified') return { status: 'unavailable', reason: result?.reason ?? 'evaluation-source-unavailable' };
    // Decoder guarantees JSON-compatible data; the public engine owns instance schema admission.
    const value = structuredClone(result.data) as Extract<Awaited<ReturnType<InstanceSourceResolver>>, { status: 'loaded' }>['value'];
    options.signal.throwIfAborted(); assertCurrent();
    return { status: 'loaded', value };
  };
}
