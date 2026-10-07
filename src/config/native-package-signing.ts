import { snapshotFiniteJson } from '@formspec-org/surface';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react/widget-metadata';
import type { ResponseActionRole } from '../shared/response-action-controller.ts';

export interface NativePackageSigningConfig {
  keyId: string;
  definition: { url: string; version: string };
  bundle: { id: string; version: string };
  module: { id: string; version: string };
  initialLocale: string;
  roles: Record<ResponseActionRole, { artifactRef: string; actionRef: string }>;
  bindings: Readonly<Record<string, { catalogRef: string; sourceRef: string }>>;
  /** Syntax only; the host must qualify writable paths against the admitted Definition. */
  readiness: { instance: string; readyPath: string; ownedPath: string };
}

const roles = { saveInitial: true, saveOwned: true, prepare: true, sign: true, submit: true, paper: true } satisfies Record<ResponseActionRole, true>;
const inputNames = [...new Set([...SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs,
  ...RESPONSE_REVIEW_WIDGET_SHAPE.dataInputs].map(input => input.name))];

/** Closed, detached deployment configuration; does not admit a package or signing authority. */
export function nativePackageSigningConfig(value: unknown): NativePackageSigningConfig {
  const config = snapshotFiniteJson(value);
  closed(config, ['keyId', 'definition', 'bundle', 'module', 'initialLocale', 'roles', 'bindings', 'readiness']);
  nonblank(config.keyId);
  for (const name of ['definition', 'bundle', 'module'] as const) {
    const pin = config[name]; const identity = name === 'definition' ? 'url' : 'id';
    closed(pin, [identity, 'version']); nonblank(pin[identity]); nonblank(pin.version);
    if (name !== 'module') absoluteUrl(pin[identity]);
  }
  nonblank(config.initialLocale);
  try { Intl.getCanonicalLocales(config.initialLocale); } catch { invalid(); }
  closed(config.roles, Object.keys(roles));
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
