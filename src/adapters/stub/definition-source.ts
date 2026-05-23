import type { Definition, DefinitionSource } from '../../ports/definition-source.ts';

/**
 * Stub DefinitionSource for tests + scaffold smoke test.
 * Returns whatever was registered via `registerDefinition`; throws otherwise.
 */
export function stubDefinitionSource(): DefinitionSource & {
  registerDefinition(url: string, definition: Definition, version?: string): void;
} {
  const registry = new Map<string, Definition>();
  const key = (url: string, version?: string): string => `${url}@${version ?? 'latest'}`;

  return {
    registerDefinition(url, definition, version) {
      registry.set(key(url, version), definition);
    },
    async getDefinition(url, version) {
      const found = registry.get(key(url, version));
      if (found === undefined) {
        throw new Error(`stub DefinitionSource: not registered: ${key(url, version)}`);
      }
      return found;
    },
  };
}
