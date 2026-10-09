import { targetDefinitionMatches, type ComponentDocument, type FormDefinition, type LocaleDocument, type ThemeDocument } from '@formspec-org/types';
import type { ResponseActionsDocumentInput as ResponseActionsDocument } from '@formspec-org/engine';
import canonicalize from 'canonicalize';
import type { BundleExportAppGraphReportProducerRequest, ComponentRouteResolver } from '@formspec-org/app-graph';
import { snapshotFiniteJson, type BundleExport } from '@formspec-org/surface';
import type { DefinitionSource } from '../../ports/definition-source.ts';

interface PinnedFile { path: string; sha256: string }
interface PinnedComponent extends PinnedFile { ref: { handle: string; url: string; version: string } }
interface PackageFiles {
  definition: PinnedFile;
  theme?: PinnedFile;
  responseActions?: PinnedFile;
  locales?: PinnedFile[];
  nativeBundle?: PinnedFile;
  component?: PinnedComponent;
}
interface LoadedPackage {
  definition: FormDefinition;
  theme: ThemeDocument | null;
  responseActions: ResponseActionsDocument | null;
  locales: LocaleDocument[];
  nativeBundle: BundleExport | null;
  component: ComponentDocument | null;
  componentRouteResolver: ComponentRouteResolver | null;
}

export type NativeBundleValidationOptions = Omit<BundleExportAppGraphReportProducerRequest,
  'manifest' | 'documents' | 'schemaValidators' | 'source' | 'digest'>;

/** Load authored JSON files through a hash-pinned same-origin package manifest. */
export class PinnedPackageDefinitionSource implements DefinitionSource {
  private loaded?: Promise<LoadedPackage>;
  private readonly componentSelection?: PinnedComponent['ref'];

  constructor(
    private readonly manifestUrl: string,
    private readonly nativeValidation: NativeBundleValidationOptions = {},
    componentSelection?: PinnedComponent['ref'],
  ) {
    if (componentSelection !== undefined) {
      const selected = snapshotFiniteJson(componentSelection);
      if (!isRecord(selected) || Object.keys(selected).length !== 3
        || ['handle', 'url', 'version'].some(key => typeof selected[key] !== 'string'
          || !selected[key].trim() || selected[key] !== selected[key].trim())) {
        throw new Error('Package inline Component selection is malformed');
      }
      const url = new URL(selected.url as string);
      if (!['http:', 'https:', 'urn:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Package inline Component selection is malformed');
      }
      this.componentSelection = selected as unknown as PinnedComponent['ref'];
    }
  }

  private getPackage(): Promise<LoadedPackage> {
    return this.loaded ??= this.load(this.manifestUrl);
  }

  async getDefinition(): Promise<FormDefinition> { return structuredClone((await this.getPackage()).definition); }
  async getLocaleDocuments(): Promise<LocaleDocument[]> { return structuredClone((await this.getPackage()).locales); }
  async getThemeDocument(): Promise<ThemeDocument | null> { return structuredClone((await this.getPackage()).theme); }
  async getResponseActionsDocument(): Promise<ResponseActionsDocument | null> {
    return structuredClone((await this.getPackage()).responseActions);
  }

  async getComponentDocument(): Promise<ComponentDocument | null> {
    return structuredClone((await this.getPackage()).component);
  }

  /** Locally hash-pinned, schema/graph-qualified resources; no signed-release authority. */
  async getNativeBundleExport(): Promise<BundleExport | null> {
    return structuredClone((await this.getPackage()).nativeBundle);
  }

  /** Reuse the immutable graph prepared by this package's completed validation. */
  async getComponentRouteResolver(): Promise<ComponentRouteResolver | null> {
    return (await this.getPackage()).componentRouteResolver;
  }

  private async load(manifestUrl: string): Promise<LoadedPackage> {
    const manifest = new URL(manifestUrl, window.location.href);
    if (manifest.origin !== window.location.origin) throw new Error('Package must use this app origin');
    const response = await fetch(manifest, { redirect: 'error' });
    if (!response.ok) throw new Error(`Package manifest failed: HTTP ${response.status}`);
    const { files } = await response.json() as { files: PackageFiles };
    if (this.componentSelection && (!files.nativeBundle || files.component)) {
      throw new Error('Package inline Component selection requires a native bundle without an external Component');
    }
    if (Object.hasOwn(files, 'nativeBundle') && !isRecord(files.nativeBundle)) {
      throw new Error('Package native bundle file pin is malformed');
    }
    if (Object.hasOwn(files, 'component') && (!isRecord(files.component) || !files.nativeBundle)) {
      throw new Error('Package Component requires a pinned native bundle');
    }
    const read = async <T>(file: PinnedFile): Promise<T> => {
      if (!isRecord(file) || typeof file.path !== 'string' || !file.path
        || typeof file.sha256 !== 'string') throw new Error('Package file pin is malformed');
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
    const [definition, theme, responseActions, locales, nativeCandidate, componentCandidate] = await Promise.all([
      read<FormDefinition>(files.definition),
      files.theme ? read<ThemeDocument>(files.theme) : null,
      files.responseActions ? read<ResponseActionsDocument>(files.responseActions) : null,
      Promise.all((files.locales ?? []).map(file => read<LocaleDocument>(file))),
      files.nativeBundle ? read<unknown>(files.nativeBundle) : null,
      files.component ? read<unknown>(files.component) : null,
    ]);
    const qualified = files.nativeBundle
      ? await this.qualifyNativeBundle(nativeCandidate, definition, locales,
        new URL(files.nativeBundle.path, manifest).href, files.nativeBundle.sha256,
        files.component ? { pin: files.component, document: componentCandidate, source: new URL(files.component.path, manifest).href } : undefined)
      : null;
    return { definition, theme, responseActions, locales, nativeBundle: qualified?.bundle ?? null,
      component: qualified?.component ?? null, componentRouteResolver: qualified?.componentRouteResolver ?? null };
  }

  private async qualifyNativeBundle(
    candidate: unknown, definition: FormDefinition, locales: LocaleDocument[],
    source: string, digest: string,
    external?: { pin: PinnedComponent; document: unknown; source: string },
  ): Promise<{ bundle: BundleExport; component: ComponentDocument | null; componentRouteResolver: ComponentRouteResolver }> {
    if (!isRecord(candidate) || Object.keys(candidate).some(key => key !== 'manifest' && key !== 'documents')
      || !isRecord(candidate.manifest) || !isRecord(candidate.documents)) {
      throw new Error('Package native bundle must contain manifest and documents');
    }
    const documents = candidate.documents;
    if (external) {
      const ref = external.pin.ref;
      if (!isRecord(ref) || Object.keys(ref).some(key => !['handle', 'url', 'version'].includes(key))
        || typeof ref.handle !== 'string' || !ref.handle.trim() || typeof ref.url !== 'string' || !ref.url.trim()
        || typeof ref.version !== 'string' || !ref.version.trim()
        || !matchesComponentDocument(external.document, ref, definition)) {
        throw new Error('Package Component identity or Definition target differs from its explicit pin');
      }
      if (Object.hasOwn(documents, ref.url)) throw new Error('Package Component has ambiguous inline and external sources');
    }
    const [{ produceAppGraphValidationReport }, { loadSurfaceBundleSchemaValidators }] = await Promise.all([
      import('@formspec-org/app-graph'),
      import('../schema/surface-bundle-schema-validators.ts'),
    ]);
    const result = await produceAppGraphValidationReport({
      ...this.nativeValidation, manifest: candidate.manifest,
      schemaValidators: await loadSurfaceBundleSchemaValidators(), source, digest: `sha256:${digest}`,
      loader: ({ artifactKind, ref }) => {
        if (external && artifactKind === 'component' && ref.url === external.pin.ref.url
          && ref.version === external.pin.ref.version && ref.handle === external.pin.ref.handle) {
          return { status: 'loaded', document: external.document, source: external.source, digest: `sha256:${external.pin.sha256}` };
        }
        return typeof ref.url === 'string' && Object.hasOwn(documents, ref.url)
          ? { status: 'loaded', document: documents[ref.url], source: ref.url }
          : { status: 'missing' };
      },
    });
    if (!result.report.ok) throw new Error(`Package native bundle failed schema or app graph validation: ${result.report.diagnostics.map(issue => issue.code).join(', ')}`);
    if (result.moduleResolutionReport.contributions.some(use => use.expectedCategory === 'widget')
      && (!this.nativeValidation.moduleAdmission?.allowedModules?.length || !this.nativeValidation.moduleSupport)) {
      throw new Error('Package native bundle widgets require explicit host module admission and support');
    }
    const handles = Object.values(result.artifactResolutionReport.artifacts).flat();
    const referenced = new Set(handles.map(handle => handle.ref?.url));
    if (Object.keys(candidate.documents).some(url => !referenced.has(url))) {
      throw new Error('Package native bundle contains an unmanifested document');
    }
    if (external) {
      const components = result.artifactResolutionReport.artifacts.components ?? [];
      if (components.length !== 1 || components[0].ref?.handle !== external.pin.ref.handle
        || components[0].ref?.url !== external.pin.ref.url || components[0].ref?.version !== external.pin.ref.version
        || !sameDocument(components[0].document, external.document)) {
        throw new Error('Package Component must match exactly one native manifest reference');
      }
    }
    let component = external ? external.document as ComponentDocument : null;
    if (this.componentSelection) {
      const matches = (result.artifactResolutionReport.artifacts.components ?? [])
        .filter(handle => sameDocument(handle.ref, this.componentSelection));
      if (matches.length !== 1 || !matchesComponentDocument(matches[0].document, this.componentSelection, definition)) {
        throw new Error('Package inline Component differs from its explicit selection or Definition target');
      }
      component = matches[0].document as ComponentDocument;
    }
    const definitions = result.artifactResolutionReport.artifacts.definitions ?? [];
    if (definitions.filter(handle => matchesSidecar(handle, definition)).length !== 1) {
      throw new Error('Package native bundle Definition differs from the pinned sidecar');
    }
    const localeHandles = result.artifactResolutionReport.artifacts.locales ?? [];
    if (localeHandles.length !== locales.length || locales.some(locale =>
      localeHandles.filter(handle => matchesSidecar(handle, locale)).length !== 1)
      || localeHandles.some(handle => locales.filter(locale => matchesSidecar(handle, locale)).length !== 1)) {
      throw new Error('Package native bundle Locales differ from the pinned sidecars');
    }
    const bundle = candidate as unknown as BundleExport;
    if (typeof result.componentRouteResolver !== 'function') throw new Error('Package native Component route resolution is unavailable');
    return { bundle: structuredClone(bundle), component: structuredClone(component), componentRouteResolver: result.componentRouteResolver };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesComponentDocument(document: unknown, ref: { url: string; version: string }, definition: FormDefinition): boolean {
  const target = isRecord(document) ? document.targetDefinition : undefined;
  return isRecord(document) && document.url === ref.url && document.version === ref.version
    && isRecord(target) && typeof target.url === 'string'
    && (target.compatibleVersions === undefined || typeof target.compatibleVersions === 'string')
    && targetDefinitionMatches({ url: target.url, compatibleVersions: target.compatibleVersions as string | undefined }, definition);
}

function matchesSidecar(
  handle: { ref?: { url?: string; version?: string }; document?: unknown },
  document: { url?: string; version: string },
): boolean {
  return typeof document.url === 'string' && handle.ref?.url === document.url
    && handle.ref.version === document.version
    && canonicalize(handle.document) === canonicalize(document);
}

function sameDocument(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}
