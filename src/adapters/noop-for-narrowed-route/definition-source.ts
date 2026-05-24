import type { DefinitionSource } from '../../ports/definition-source.ts';
import { notForNarrowedRouteError } from './_error.ts';

export function noopDefinitionSource(routeCite?: string): DefinitionSource {
  return {
    async getDefinition() {
      throw notForNarrowedRouteError('DefinitionSource', routeCite);
    },
  };
}
