import type { HttpClientConfig } from '../http/http-client.ts';

/** Tab-local credentials and server handles only. Response documents never enter this store. */
export interface DraftResumeMetadataStore {
  read(slot: string): unknown | undefined;
  write(slot: string, value: unknown): void;
  remove(slot: string): void;
}

export function createBrowserDraftResumeMetadataStore(
  config: Pick<HttpClientConfig, 'baseUrl' | 'tenantBinding'>,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): DraftResumeMetadataStore {
  const context = JSON.stringify({
    endpoint: new URL(config.baseUrl).href.replace(/\/+$/, ''),
    tenantBinding: config.tenantBinding ? {
      kind: config.tenantBinding.kind,
      scope: (() => {
        const scope = config.tenantBinding.kind === 'bound' ? config.tenantBinding.scope : config.tenantBinding.sentinelScope;
        return { tenant: scope.tenant, workspace: scope.workspace, environment: scope.environment, cell: scope.cell };
      })(),
      headerMode: config.tenantBinding.kind === 'implicit' ? config.tenantBinding.headerMode : null,
    } : null,
  });
  const keyFor = (slot: string) => `formspec-web:draft-resume:v1:${context}:${slot}`;
  const access = <T>(operation: (target: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) => T): T => {
    try { return operation(storage ?? window.sessionStorage); }
    catch (cause) { throw new Error('Tab draft-resume storage is unavailable or invalid', { cause }); }
  };
  return {
    read(slot) {
      return access(target => {
        const raw = target.getItem(keyFor(slot));
        if (raw === null) return undefined;
        const record = JSON.parse(raw);
        if (!record || record.context !== context || record.slot !== slot || !('value' in record)) {
          throw new Error('Stored draft-resume metadata does not match this deployment context');
        }
        return record.value;
      });
    },
    write(slot, value) {
      access(target => target.setItem(keyFor(slot), JSON.stringify({ context, slot, value })));
    },
    remove(slot) { access(target => target.removeItem(keyFor(slot))); },
  };
}
