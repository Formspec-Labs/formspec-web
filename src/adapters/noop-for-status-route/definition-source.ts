import type { DefinitionSource } from '../../ports/definition-source.ts';
import { notForStatusRouteError } from './_error.ts';

export function noopDefinitionSource(): DefinitionSource {
  return {
    async getDefinition() {
      throw notForStatusRouteError('DefinitionSource');
    },
  };
}
