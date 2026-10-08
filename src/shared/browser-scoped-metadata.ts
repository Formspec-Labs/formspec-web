/** Values are parsed JSON; each caller validates its own metadata meaning and scope. */
export interface ScopedMetadataStore {
  read(slot: string): unknown | undefined;
  write(slot: string, value: unknown): void;
  remove(slot: string): void;
}

export interface BrowserScopedMetadataConfig {
  namespace: string;
  context: Record<string, unknown>;
}

type MetadataStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Same-tab persistence only. The default sessionStorage is accessed during operations. */
export function createBrowserScopedMetadataStore(
  config: BrowserScopedMetadataConfig,
  storage?: MetadataStorage,
): ScopedMetadataStore {
  if (typeof config.namespace !== 'string' || !/^[A-Za-z0-9:._-]+$/.test(config.namespace)) {
    throw new Error('Scoped metadata namespace must be a nonempty identifier');
  }
  const namespace = config.namespace;
  let context: string;
  try {
    if (!isRecord(config.context)) throw new Error('Scoped metadata context must be an object');
    const serialized = JSON.stringify(config.context);
    if (serialized === undefined || !isRecord(JSON.parse(serialized))) {
      throw new Error('Scoped metadata context must serialize to a JSON object');
    }
    context = serialized;
  } catch (cause) {
    throw new Error('Scoped metadata context is invalid', { cause });
  }
  const keyFor = (slot: string): string => {
    if (typeof slot !== 'string' || slot.length === 0) {
      throw new Error('Scoped metadata slot must be a nonempty string');
    }
    return `${namespace}:${context}:${slot}`;
  };
  const access = <T>(operation: () => T): T => {
    try { return operation(); }
    catch (cause) { throw new Error('Tab scoped-metadata storage is unavailable or invalid', { cause }); }
  };
  return {
    read(slot) {
      return access(() => {
        const key = keyFor(slot);
        const raw = (storage ?? window.sessionStorage).getItem(key);
        if (raw === null) return undefined;
        const record: unknown = JSON.parse(raw);
        if (!isRecord(record) || !Object.hasOwn(record, 'context') || !Object.hasOwn(record, 'slot')
          || !Object.hasOwn(record, 'value') || record.context !== context || record.slot !== slot) {
          throw new Error('Stored metadata does not match this context and slot');
        }
        return record.value;
      });
    },
    write(slot, value) {
      access(() => {
        const key = keyFor(slot);
        const raw = JSON.stringify({ context, slot, value });
        if (!Object.hasOwn(JSON.parse(raw), 'value')) {
          throw new Error('Scoped metadata value must survive JSON serialization');
        }
        const target = storage ?? window.sessionStorage;
        target.setItem(key, raw);
        if (target.getItem(key) !== raw) throw new Error('Scoped metadata write was not retained exactly');
      });
    },
    remove(slot) {
      access(() => {
        const key = keyFor(slot);
        const target = storage ?? window.sessionStorage;
        target.removeItem(key);
        if (target.getItem(key) !== null) throw new Error('Scoped metadata removal was not retained');
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
