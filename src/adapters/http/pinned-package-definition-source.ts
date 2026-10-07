import type { FormDefinition, LocaleDocument, ThemeDocument } from '@formspec-org/types';
import type { ResponseActionsDocumentInput as ResponseActionsDocument } from '@formspec-org/engine';
import type { DefinitionSource } from '../../ports/definition-source.ts';

interface PinnedFile { path: string; sha256: string }
interface PackageFiles {
  definition: PinnedFile;
  theme?: PinnedFile;
  responseActions?: PinnedFile;
  locales?: PinnedFile[];
}
interface LoadedPackage {
  definition: FormDefinition;
  theme: ThemeDocument | null;
  responseActions: ResponseActionsDocument | null;
  locales: LocaleDocument[];
}

/** Load authored JSON files through a hash-pinned same-origin package manifest. */
export class PinnedPackageDefinitionSource implements DefinitionSource {
  private loaded?: Promise<LoadedPackage>;

  constructor(private readonly manifestUrl: string) {}

  private getPackage(): Promise<LoadedPackage> {
    return this.loaded ??= this.load(this.manifestUrl);
  }

  async getDefinition(): Promise<FormDefinition> { return (await this.getPackage()).definition; }
  async getLocaleDocuments(): Promise<LocaleDocument[]> { return (await this.getPackage()).locales; }
  async getThemeDocument(): Promise<ThemeDocument | null> { return (await this.getPackage()).theme; }
  async getResponseActionsDocument(): Promise<ResponseActionsDocument | null> {
    return (await this.getPackage()).responseActions;
  }

  private async load(manifestUrl: string): Promise<LoadedPackage> {
    const manifest = new URL(manifestUrl, window.location.href);
    if (manifest.origin !== window.location.origin) throw new Error('Package must use this app origin');
    const response = await fetch(manifest, { redirect: 'error' });
    if (!response.ok) throw new Error(`Package manifest failed: HTTP ${response.status}`);
    const { files } = await response.json() as { files: PackageFiles };
    const read = async <T>(file: PinnedFile): Promise<T> => {
      const url = new URL(file.path, manifest);
      if (url.origin !== manifest.origin) throw new Error('Package file must use this app origin');
      const result = await fetch(url, { redirect: 'error' });
      if (!result.ok) throw new Error(`Package file failed: HTTP ${result.status}`);
      const bytes = await result.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256) throw new Error(`Package hash mismatch: ${file.path}`);
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    };
    const [definition, theme, responseActions, locales] = await Promise.all([
      read<FormDefinition>(files.definition),
      files.theme ? read<ThemeDocument>(files.theme) : null,
      files.responseActions ? read<ResponseActionsDocument>(files.responseActions) : null,
      Promise.all((files.locales ?? []).map(file => read<LocaleDocument>(file))),
    ]);
    return { definition, theme, responseActions, locales };
  }
}
