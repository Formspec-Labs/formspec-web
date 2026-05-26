import type {
  ComponentDocument,
  ComponentGraphProjectionContext,
  DefinitionSource,
  FormDefinition,
  LayoutHostEvidence,
  LocaleDocument,
} from '../../ports/definition-source.ts';

/**
 * Stub DefinitionSource for tests + scaffold smoke test.
 * Returns whatever was registered via `registerDefinition`; throws otherwise.
 */
export function stubDefinitionSource(): DefinitionSource & {
  registerDefinition(url: string, definition: FormDefinition, version?: string): void;
  registerLocaleDocuments(url: string, documents: readonly LocaleDocument[], version?: string): void;
  registerComponentDocument(url: string, document: ComponentDocument, version?: string): void;
  registerComponentGraphContext(url: string, context: ComponentGraphProjectionContext, version?: string): void;
  registerLayoutHostEvidence(url: string, evidence: LayoutHostEvidence, version?: string): void;
} {
  const registry = new Map<string, FormDefinition>();
  const localeRegistry = new Map<string, LocaleDocument[]>();
  const componentDocumentRegistry = new Map<string, ComponentDocument>();
  const componentGraphRegistry = new Map<string, ComponentGraphProjectionContext>();
  const layoutHostEvidenceRegistry = new Map<string, LayoutHostEvidence>();
  const key = (url: string, version?: string): string => `${url}@${version ?? 'latest'}`;

  return {
    registerDefinition(url, definition, version) {
      registry.set(key(url, version), definition);
    },
    registerLocaleDocuments(url, documents, version) {
      localeRegistry.set(key(url, version), [...documents]);
    },
    registerComponentDocument(url, document, version) {
      componentDocumentRegistry.set(key(url, version), document);
    },
    registerComponentGraphContext(url, context, version) {
      componentGraphRegistry.set(key(url, version), context);
    },
    registerLayoutHostEvidence(url, evidence, version) {
      layoutHostEvidenceRegistry.set(key(url, version), evidence);
    },
    async getDefinition(url, version) {
      const found = registry.get(key(url, version));
      if (found === undefined) {
        throw new Error(`stub DefinitionSource: not registered: ${key(url, version)}`);
      }
      return found;
    },
    async getLocaleDocuments(url, version) {
      return [...(localeRegistry.get(key(url, version)) ?? [])];
    },
    async getComponentDocument(url, version) {
      return componentDocumentRegistry.get(key(url, version)) ?? null;
    },
    async getComponentGraphContext(url, version) {
      return componentGraphRegistry.get(key(url, version)) ?? null;
    },
    async getLayoutHostEvidence(url, version) {
      return layoutHostEvidenceRegistry.get(key(url, version)) ?? null;
    },
  };
}
