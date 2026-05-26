import type {
  ComponentDocument,
  ComponentGraphProjectionContext,
  DefinitionSource,
  FormDefinition,
  LocaleDocument,
} from '../../ports/definition-source.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface HttpDefinitionSourceConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
}

interface PublishedRuntimeView {
  definition?: unknown;
  component_document?: unknown;
  componentDocument?: unknown;
  component_graph?: unknown;
  componentGraph?: unknown;
  locales?: unknown;
  locale_documents?: unknown;
  localeDocuments?: unknown;
  locale_refs?: unknown;
  runtime_config?: unknown;
  runtimeConfig?: unknown;
}

export class HttpDefinitionSource implements DefinitionSource {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;
  private readonly runtimePayloads = new Map<string, Promise<PublishedRuntimeView | FormDefinition>>();

  constructor(config: HttpDefinitionSourceConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
  }

  async getDefinition(url: string, version?: string): Promise<FormDefinition> {
    const payload = await this.getRuntimePayload(url, version);
    return extractDefinition(payload);
  }

  async getLocaleDocuments(url: string, version?: string): Promise<LocaleDocument[]> {
    const payload = await this.getRuntimePayload(url, version);
    const definition = extractDefinition(payload);
    return extractLocaleDocuments(payload, definition);
  }

  async getComponentDocument(url: string, version?: string): Promise<ComponentDocument | null> {
    const payload = await this.getRuntimePayload(url, version);
    return extractComponentDocument(payload);
  }

  async getComponentGraphContext(
    url: string,
    version?: string,
  ): Promise<ComponentGraphProjectionContext | null> {
    const payload = await this.getRuntimePayload(url, version);
    return extractComponentGraphContext(payload);
  }

  private async getRuntimePayload(
    url: string,
    version?: string,
  ): Promise<PublishedRuntimeView | FormDefinition> {
    const formId = this.formIdResolver(url, version);
    const cacheKey = `${formId}@${version ?? 'latest'}`;
    const cached = this.runtimePayloads.get(cacheKey);
    if (cached) {
      return cached;
    }

    const payload = this.client
      .getJson<PublishedRuntimeView | FormDefinition>(
        `/runtime/forms/${encodeURIComponent(formId)}`,
      )
      .catch((error) => {
        this.runtimePayloads.delete(cacheKey);
        throw error;
      });
    this.runtimePayloads.set(cacheKey, payload);
    return payload;
  }
}

export function createHttpDefinitionSource(
  config: HttpDefinitionSourceConfig,
): HttpDefinitionSource {
  return new HttpDefinitionSource(config);
}

function extractDefinition(payload: PublishedRuntimeView | FormDefinition): FormDefinition {
  if (isFormDefinition(payload)) {
    return payload;
  }
  if (payload.definition && isFormDefinition(payload.definition)) {
    return payload.definition;
  }
  throw new Error('HTTP DefinitionSource response did not include a FormDefinition');
}

export function extractLocaleDocuments(
  payload: PublishedRuntimeView | FormDefinition,
  definition: FormDefinition,
): LocaleDocument[] {
  if (isFormDefinition(payload)) {
    return [];
  }

  return uniqueLocaleDocuments([
    ...localeDocumentsFromValue(payload.locales),
    ...localeDocumentsFromValue(payload.locale_documents),
    ...localeDocumentsFromValue(payload.localeDocuments),
  ]).filter((document) => document.targetDefinition.url === definition.url);
}

export function extractComponentDocument(
  payload: PublishedRuntimeView | FormDefinition,
): ComponentDocument | null {
  if (isFormDefinition(payload)) {
    return null;
  }
  return firstComponentDocument([
    payload.component_document,
    payload.componentDocument,
  ]);
}

export function extractComponentGraphContext(
  payload: PublishedRuntimeView | FormDefinition,
): ComponentGraphProjectionContext | null {
  if (isFormDefinition(payload)) {
    return null;
  }
  return firstComponentGraphContext([
    payload.component_graph,
    payload.componentGraph,
    runtimeConfigValue(payload.runtime_config, 'component_graph'),
    runtimeConfigValue(payload.runtime_config, 'componentGraph'),
    runtimeConfigValue(payload.runtimeConfig, 'component_graph'),
    runtimeConfigValue(payload.runtimeConfig, 'componentGraph'),
  ]);
}

function isFormDefinition(value: unknown): value is FormDefinition {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.$formspec === '1.0' &&
    typeof value.url === 'string' &&
    typeof value.version === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.items)
  );
}

function firstComponentDocument(values: unknown[]): ComponentDocument | null {
  for (const value of values) {
    if (isComponentDocument(value)) {
      return value;
    }
  }
  return null;
}

function isComponentDocument(value: unknown): value is ComponentDocument {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.$formspecComponent === '1.0' ||
      value.$formspecComponent === '1.1' ||
      value.$formspecComponent === '1.2') &&
    typeof value.version === 'string' &&
    isRecord(value.tree) &&
    typeof value.tree.component === 'string'
  );
}

function runtimeConfigValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function firstComponentGraphContext(values: unknown[]): ComponentGraphProjectionContext | null {
  for (const value of values) {
    if (isComponentGraphProjectionContext(value)) {
      return value;
    }
  }
  return null;
}

function isComponentGraphProjectionContext(value: unknown): value is ComponentGraphProjectionContext {
  if (!isRecord(value) || !isRecord(value.component) || !isRecord(value.surface)) {
    return false;
  }
  const component = value.component;
  const surface = value.surface;
  return (
    typeof component.handle === 'string' &&
    (component.url === undefined || typeof component.url === 'string') &&
    (component.version === undefined || typeof component.version === 'string') &&
    typeof surface.url === 'string' &&
    (surface.version === undefined || typeof surface.version === 'string') &&
    typeof value.route === 'string'
  );
}

function localeDocumentsFromValue(value: unknown): LocaleDocument[] {
  if (Array.isArray(value)) {
    return value.filter(isLocaleDocument);
  }
  if (isLocaleDocument(value)) {
    return [value];
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).filter(isLocaleDocument);
}

function isLocaleDocument(value: unknown): value is LocaleDocument {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.$formspecLocale !== '1.0' ||
    typeof value.version !== 'string' ||
    typeof value.locale !== 'string' ||
    !isRecord(value.targetDefinition) ||
    typeof value.targetDefinition.url !== 'string' ||
    !isRecord(value.strings)
  ) {
    return false;
  }
  return Object.values(value.strings).every((entry) => typeof entry === 'string');
}

function uniqueLocaleDocuments(documents: LocaleDocument[]): LocaleDocument[] {
  const seen = new Set<string>();
  return documents.filter((document) => {
    const key = [
      document.locale.toLowerCase(),
      document.url ?? '',
      document.version,
      document.targetDefinition.url,
    ].join('\0');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
