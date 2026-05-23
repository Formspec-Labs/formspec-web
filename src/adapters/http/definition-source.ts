import type { DefinitionSource, FormDefinition } from '../../ports/definition-source.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';
import { defaultFormIdResolver, type FormIdResolver } from './form-id.ts';

export interface HttpDefinitionSourceConfig extends HttpClientConfig {
  formIdResolver?: FormIdResolver;
}

interface PublishedRuntimeView {
  definition?: unknown;
}

export class HttpDefinitionSource implements DefinitionSource {
  private readonly client: HttpClient;
  private readonly formIdResolver: FormIdResolver;

  constructor(config: HttpDefinitionSourceConfig) {
    this.client = new HttpClient(config);
    this.formIdResolver = config.formIdResolver ?? defaultFormIdResolver;
  }

  async getDefinition(url: string, version?: string): Promise<FormDefinition> {
    const formId = this.formIdResolver(url, version);
    const payload = await this.client.getJson<PublishedRuntimeView | FormDefinition>(
      `/runtime/forms/${encodeURIComponent(formId)}`,
    );
    return extractDefinition(payload);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
