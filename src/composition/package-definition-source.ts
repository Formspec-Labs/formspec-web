import type { PinnedPackageDefinitionSource } from '../adapters/http/pinned-package-definition-source.ts';
import type { DefinitionSource } from '../ports/definition-source.ts';

/** Bind explicit host selectors while preserving the package's canonical identity. */
export function bindPackageDefinitionSource(
  source: PinnedPackageDefinitionSource,
  allowedUrls: readonly string[],
): DefinitionSource {
  const selectors = new Set(allowedUrls);
  const getDefinition = async (url: string, version?: string) => {
    if (!selectors.has(url)) throw new Error('Package Definition selection mismatch');
    return source.getDefinition(undefined, version);
  };
  return {
    getDefinition,
    async getThemeDocument(url, version) {
      await getDefinition(url, version);
      return source.getThemeDocument();
    },
    async getResponseActionsDocument(url, version) {
      await getDefinition(url, version);
      return source.getResponseActionsDocument();
    },
    async getLocaleDocuments(url, version) {
      await getDefinition(url, version);
      return source.getLocaleDocuments();
    },
    async getComponentDocument(url, version) {
      await getDefinition(url, version);
      return source.getComponentDocument();
    },
  };
}
