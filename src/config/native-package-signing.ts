import { snapshotFiniteJson } from '@formspec-org/surface';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react/widget-metadata';
import type { NativeSigningScopeSelection } from '../shared/native-signing-scope.ts';
import type { ResponseActionRole } from '../shared/response-action-controller.ts';

export interface NativeStructuredPanelWidget {
  readonly moduleId: string;
  readonly registryEntryVersion: '0.1.0' | '0.1.1';
}

export interface NativePackageSigningConfig {
  keyId: string;
  definition: { url: string; version: string };
  bundle: { id: string; version: string };
  module: { id: string; version: string };
  /** Explicit package module pins; omission admits only the signing module. */
  modules?: readonly { id: string; version: string }[];
  /** Explicit supported StructuredPanel version for each selected module. */
  structuredPanelWidgets?: readonly NativeStructuredPanelWidget[];
  /** Exact inline Component selection; omission retains the external file path. */
  component?: { handle: string; url: string; version: string };
  /** Exact deployment-approved static image URLs; omission admits no image source. */
  staticAssets?: readonly { kind: 'image'; source: string }[];
  initialLocale: string;
  /** Exact ceremony and sibling review; omission retains one-ceremony admission. */
  signingScope?: NativeSigningScopeSelection;
  roles: Record<Exclude<ResponseActionRole, 'startApplication'>, { artifactRef: string; actionRef: string }>
    & Partial<Record<'startApplication', { artifactRef: string; actionRef: string }>>;
  applicationLifecycle?: { instance: string; canStartPath: string; startedPath: string; persistentSavingPath: string };
  bindings: Readonly<Record<string, { catalogRef: string; sourceRef: string }>>;
  /** Syntax only; the host must qualify writable paths against the admitted Definition. */
  readiness: { instance: string; readyPath: string; ownedPath: string };
}

const roles = { saveInitial: true, saveOwned: true, prepare: true, sign: true, submit: true, paper: true } satisfies Record<Exclude<ResponseActionRole, 'startApplication'>, true>;
const inputNames = [...new Set([...SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs,
  ...RESPONSE_REVIEW_WIDGET_SHAPE.dataInputs].map(input => input.name))];

/** Closed, detached deployment configuration; does not admit a package or signing authority. */
export function nativePackageSigningConfig(value: unknown): NativePackageSigningConfig {
  const config = snapshotFiniteJson(value);
  closed(config, ['keyId', 'definition', 'bundle', 'module', 'initialLocale', 'roles', 'bindings', 'readiness',
    ...(config && typeof config === 'object' && Object.hasOwn(config, 'signingScope') ? ['signingScope'] : []),
    ...(config && typeof config === 'object' && Object.hasOwn(config, 'modules') ? ['modules'] : []),
    ...(config && typeof config === 'object' && Object.hasOwn(config, 'structuredPanelWidgets') ? ['structuredPanelWidgets'] : []),
    ...(config && typeof config === 'object' && Object.hasOwn(config, 'component') ? ['component'] : []),
    ...(config && typeof config === 'object' && Object.hasOwn(config, 'staticAssets') ? ['staticAssets'] : []),
    ...(config && typeof config === 'object' && Object.hasOwn(config, 'applicationLifecycle') ? ['applicationLifecycle'] : [])]);
  nonblank(config.keyId);
  for (const name of ['definition', 'bundle', 'module'] as const) {
    const pin = config[name]; const identity = name === 'definition' ? 'url' : 'id';
    closed(pin, [identity, 'version']); nonblank(pin[identity]); nonblank(pin.version);
    if (name !== 'module') absoluteUrl(pin[identity]);
  }
  if (Object.hasOwn(config, 'modules')) {
    if (!Array.isArray(config.modules) || !config.modules.length) invalid();
    const moduleIds = new Set<string>();
    for (const pin of config.modules) {
      closed(pin, ['id', 'version']); nonblank(pin.id); nonblank(pin.version);
      unique(moduleIds, pin.id);
    }
    const signing = config.module as { id: string; version: string };
    if (config.modules.filter(pin => pin.id === signing.id && pin.version === signing.version).length !== 1) invalid();
  }
  if (Object.hasOwn(config, 'structuredPanelWidgets')) {
    if (!Array.isArray(config.structuredPanelWidgets) || !config.structuredPanelWidgets.length) invalid();
    const selected = Array.isArray(config.modules) ? config.modules : [config.module]; const ids = new Set<string>();
    for (const pin of config.structuredPanelWidgets) {
      closed(pin, ['moduleId', 'registryEntryVersion']); nonblank(pin.moduleId); unique(ids, pin.moduleId);
      if ((pin.registryEntryVersion !== '0.1.0' && pin.registryEntryVersion !== '0.1.1')
        || !selected.some(module => module.id === pin.moduleId)) invalid();
    }
  }
  if (Object.hasOwn(config, 'signingScope')) {
    const scope = config.signingScope;
    closed(scope, ['surface', 'route', 'ceremonySlot', 'reviewSlot']);
    closed(scope.surface, ['url', 'version']); absoluteUrl(scope.surface.url); nonblank(scope.surface.version);
    nonblank(scope.route); nonblank(scope.ceremonySlot); nonblank(scope.reviewSlot);
    if (scope.ceremonySlot === scope.reviewSlot) invalid();
  }
  nonblank(config.initialLocale);
  if (Object.hasOwn(config, 'staticAssets')) {
    if (!Array.isArray(config.staticAssets) || !config.staticAssets.length) invalid();
    const sources = new Set<string>();
    for (const pin of config.staticAssets) {
      closed(pin, ['kind', 'source']);
      if (pin.kind !== 'image') invalid();
      nonblank(pin.source);
      try {
        const url = new URL(pin.source);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) invalid();
      } catch { invalid(); }
      unique(sources, pin.source);
    }
  }
  if (Object.hasOwn(config, 'component')) {
    closed(config.component, ['handle', 'url', 'version']);
    nonblank(config.component.handle); absoluteUrl(config.component.url); nonblank(config.component.version);
  }
  try { Intl.getCanonicalLocales(config.initialLocale); } catch { invalid(); }
  closed(config.roles, [...Object.keys(roles), ...(Object.hasOwn(config, 'applicationLifecycle') ? ['startApplication'] : [])]);
  if (Object.hasOwn(config, 'applicationLifecycle')) {
    const lifecycle = config.applicationLifecycle;
    closed(lifecycle, ['instance', 'canStartPath', 'startedPath', 'persistentSavingPath']);
    Object.values(lifecycle).forEach(nonblank);
    if (new Set(['canStartPath', 'startedPath', 'persistentSavingPath'].map(key => lifecycle[key])).size !== 3) invalid();
  }
  const actions = new Set<string>();
  for (const action of Object.values(config.roles)) {
    closed(action, ['artifactRef', 'actionRef']); absoluteUrl(action.artifactRef); nonblank(action.actionRef);
    unique(actions, JSON.stringify([action.artifactRef, action.actionRef]));
  }
  closed(config.bindings, inputNames);
  const sources = new Set<string>();
  for (const binding of Object.values(config.bindings)) {
    closed(binding, ['catalogRef', 'sourceRef']); absoluteUrl(binding.catalogRef); nonblank(binding.sourceRef);
    unique(sources, JSON.stringify([binding.catalogRef, binding.sourceRef]));
  }
  closed(config.readiness, ['instance', 'readyPath', 'ownedPath']);
  Object.values(config.readiness).forEach(nonblank);
  if (config.readiness.readyPath === config.readiness.ownedPath) invalid();
  return config as unknown as NativePackageSigningConfig;
}

/** Inspect the runtime property before any spread can execute an accessor. */
export function readNativePackageSigningConfig(owner: object | undefined): NativePackageSigningConfig | undefined {
  if (!owner) return undefined;
  const property = Object.getOwnPropertyDescriptor(owner, 'nativePackageSigning');
  if (!property) {
    if ('nativePackageSigning' in owner) invalid();
    return undefined;
  }
  if (!property.enumerable || !Object.hasOwn(property, 'value')) invalid();
  return nativePackageSigningConfig(property.value);
}

function invalid(): never { throw new TypeError('Native package signing configuration is malformed'); }
function closed(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}
function nonblank(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) invalid();
}
function absoluteUrl(value: unknown): asserts value is string {
  nonblank(value);
  try {
    const url = new URL(value);
    if (!['https:', 'http:', 'urn:'].includes(url.protocol) || url.username || url.password) invalid();
  } catch { invalid(); }
}
function unique(values: Set<string>, value: string): void {
  if (values.has(value)) invalid();
  values.add(value);
}
