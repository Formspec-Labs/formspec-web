import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(repoRoot, 'scripts/check-conformance-coverage.mjs');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-conformance-coverage', () => {
  it('accepts all first-party conformance registrations', () => {
    const result = runCheck(createFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('conformance coverage check passed');
  });

  it('rejects missing unavailable sentinels used by production composition', () => {
    const result = runCheck(createFixture({
      omitPath: 'src/adapters/unavailable/status-reader.ts',
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'unavailable sentinel "unavailableStatusReader" is missing',
    );
  });

  it('rejects a missing adapter registration', () => {
    const result = runCheck(createFixture({ omitRegistration: 'OIDC IdentityProvider conformance' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "OidcAdapter" from "src/adapters/identity/oidc.ts" is not registered',
    );
  });

  it('rejects a registration that no longer names the adapter symbol', () => {
    const result = runCheck(createFixture({ omitSymbol: 'OidcAdapter' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "OidcAdapter" from "src/adapters/identity/oidc.ts" is not registered',
    );
  });

  it('rejects a registration that only names the adapter symbol in a comment', () => {
    const result = runCheck(createFixture({ commentOnlySymbol: 'OidcAdapter' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "OidcAdapter" from "src/adapters/identity/oidc.ts" is not registered',
    );
  });

  it('rejects a test framework that bypasses the public harness surface', () => {
    const result = runCheck(createFixture({ frameworkImport: '../../local/conformance.ts' }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test framework must re-export the public adapter-conformance surface');
  });

  it('rejects a test framework that only mentions the public harness in a comment', () => {
    const result = runCheck(
      createFixture({
        frameworkText:
          "export * from '../../../src/adapter-conformance/conformance.ts';\n// ../../../src/adapter-conformance/index.ts",
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test framework must re-export the public adapter-conformance surface');
  });

  it('rejects newly added first-party adapters that are not registered', () => {
    const result = runCheck(
      createFixture({
        extraAdapters: [
          {
            path: 'src/adapters/identity/passkey.ts',
            text: 'export class PasskeyAdapter implements IdentityProvider {}',
          },
        ],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "PasskeyAdapter" from "src/adapters/identity/passkey.ts" is not registered',
    );
  });

  it('rejects unregistered adapters exported separately from their class declaration', () => {
    const result = runCheck(
      createFixture({
        extraAdapters: [
          {
            path: 'src/adapters/identity/passkey.ts',
            text: 'class PasskeyAdapter implements IdentityProvider {}\nexport { PasskeyAdapter };',
          },
        ],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "PasskeyAdapter" from "src/adapters/identity/passkey.ts" is not registered',
    );
  });

  it('rejects unregistered separately exported adapters that extend a base class', () => {
    const result = runCheck(
      createFixture({
        extraAdapters: [
          {
            path: 'src/adapters/identity/passkey.ts',
            text: 'class PasskeyAdapter extends BaseAdapter implements IdentityProvider {}\nexport { PasskeyAdapter };',
          },
        ],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "PasskeyAdapter" from "src/adapters/identity/passkey.ts" is not registered',
    );
  });

  it('rejects unregistered default-exported adapters', () => {
    const result = runCheck(
      createFixture({
        extraAdapters: [
          {
            path: 'src/adapters/identity/passkey.ts',
            text: 'export default class PasskeyAdapter implements IdentityProvider {}',
          },
        ],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "PasskeyAdapter" from "src/adapters/identity/passkey.ts" is not registered',
    );
  });

  it('rejects unregistered default-exported adapters that extend a base class', () => {
    const result = runCheck(
      createFixture({
        extraAdapters: [
          {
            path: 'src/adapters/identity/passkey.ts',
            text: 'export default class PasskeyAdapter extends BaseAdapter implements IdentityProvider {}',
          },
        ],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "PasskeyAdapter" from "src/adapters/identity/passkey.ts" is not registered',
    );
  });

  it('rejects unregistered inline-exported adapters that extend a base class', () => {
    const result = runCheck(
      createFixture({
        extraAdapters: [
          {
            path: 'src/adapters/identity/passkey.ts',
            text: 'export class PasskeyAdapter extends BaseAdapter implements IdentityProvider {}',
          },
        ],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'first-party adapter "PasskeyAdapter" from "src/adapters/identity/passkey.ts" is not registered',
    );
  });

  it('rejects stale JSON-case fixture documentation', () => {
    const result = runCheck(createFixture({ staleReadmeFixtureClaim: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('still describes obsolete JSON-case fixtures');
  });
});

function runCheck(root) {
  return spawnSync('node', [scriptPath, '--root', root], {
    encoding: 'utf8',
  });
}

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formspec-web-conformance-coverage-'));
  tempRoots.push(root);

  write(
    root,
    'tests/adapter-conformance/_framework/conformance.ts',
    options.frameworkText ??
      `export * from '${options.frameworkImport ?? '../../../src/adapter-conformance/index.ts'}';`,
  );
  write(root, 'src/adapter-conformance/index.ts', publicIndex());
  write(root, 'src/composition/default.ts', defaultComposition());
  write(root, 'tests/adapter-conformance/README.md', conformanceReadme(options));
  writeAdapterFiles(root, options);
  write(
    root,
    'tests/adapter-conformance/definition-source/conformance.test.ts',
    suiteText('DefinitionSource', [
      ['stub DefinitionSource conformance', 'stubDefinitionSource'],
      ['HTTP DefinitionSource conformance', 'HttpDefinitionSource'],
    ], options),
  );
  write(
    root,
    'tests/adapter-conformance/draft-store/conformance.test.ts',
    suiteText('DraftStore', [
      ['stub DraftStore conformance', 'stubDraftStore'],
      ['HTTP DraftStore conformance', 'HttpDraftStore'],
    ], options),
  );
  write(
    root,
    'tests/adapter-conformance/submit-transport/conformance.test.ts',
    suiteText('SubmitTransport', [
      ['stub SubmitTransport conformance', 'stubSubmitTransport'],
      ['HTTP SubmitTransport conformance', 'HttpSubmitTransport'],
    ], options),
  );
  write(
    root,
    'tests/adapter-conformance/identity-provider/conformance.test.ts',
    suiteText('IdentityProvider', [
      ['stub IdentityProvider conformance', 'stubIdentityProvider'],
      ['anonymous IdentityProvider conformance', 'AnonymousAdapter'],
      ['HTTP anonymous IdentityProvider conformance', 'HttpAnonymousIdentityProvider'],
      ['OIDC IdentityProvider conformance', 'OidcAdapter'],
      ['magic-link IdentityProvider conformance', 'MagicLinkAdapter'],
    ], options),
  );
  write(
    root,
    'tests/adapter-conformance/notification-delivery/conformance.test.ts',
    suiteText(
      'NotificationDelivery',
      [['stub NotificationDelivery conformance', 'stubNotificationDelivery']],
      options,
    ),
  );
  write(
    root,
    'tests/adapter-conformance/respondent-place-source/conformance.test.ts',
    suiteText(
      'RespondentPlaceSource',
      [['stub RespondentPlaceSource conformance', 'stubRespondentPlaceSource']],
      options,
    ),
  );
  write(
    root,
    'tests/adapter-conformance/status-reader/conformance.test.ts',
    suiteText(
      'StatusReader',
      [['stub StatusReader conformance', 'stubStatusReader']],
      options,
    ),
  );
  write(
    root,
    'tests/adapter-conformance/attachment-store/conformance.test.ts',
    suiteText(
      'AttachmentStore',
      [['stub AttachmentStore conformance', 'stubAttachmentStore']],
      options,
    ),
  );
  write(
    root,
    'tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts',
    suiteText(
      'FormRuntimePolicyExtractor',
      [['stub FormRuntimePolicyExtractor conformance', 'stubFormRuntimePolicyExtractor']],
      options,
    ),
  );
  write(
    root,
    'tests/adapter-conformance/respondent-history-source/conformance.test.ts',
    suiteText(
      'RespondentHistorySource',
      [['stub RespondentHistorySource conformance', 'stubRespondentHistorySource']],
      options,
    ),
  );

  return root;
}

function writeAdapterFiles(root, options) {
  for (const [path, text] of [
    ['src/adapters/stub/definition-source.ts', 'export function stubDefinitionSource() {}'],
    ['src/adapters/stub/draft-store.ts', 'export function stubDraftStore() {}'],
    ['src/adapters/stub/submit-transport.ts', 'export function stubSubmitTransport() {}'],
    ['src/adapters/stub/identity-provider.ts', 'export function stubIdentityProvider() {}'],
    ['src/adapters/stub/notification-delivery.ts', 'export function stubNotificationDelivery() {}'],
    ['src/adapters/stub/respondent-place-source.ts', 'export function stubRespondentPlaceSource() {}'],
    ['src/adapters/stub/status-reader.ts', 'export function stubStatusReader() {}'],
    ['src/adapters/stub/attachment-store.ts', 'export function stubAttachmentStore() {}'],
    [
      'src/adapters/stub/form-runtime-policy-extractor.ts',
      'export function stubFormRuntimePolicyExtractor() {}',
    ],
    [
      'src/adapters/stub/respondent-history-source.ts',
      'export function stubRespondentHistorySource() {}',
    ],
    [
      'src/adapters/unavailable/respondent-place-source.ts',
      'export function unavailableRespondentPlaceSource() {}',
    ],
    ['src/adapters/unavailable/status-reader.ts', 'export function unavailableStatusReader() {}'],
    [
      'src/adapters/unavailable/attachment-store.ts',
      'export function unavailableAttachmentStore() {}',
    ],
    [
      'src/adapters/unavailable/respondent-history-source.ts',
      'export function unavailableRespondentHistorySource() {}',
    ],
    [
      'src/adapters/http/definition-source.ts',
      'export class HttpDefinitionSource implements DefinitionSource {}',
    ],
    ['src/adapters/http/draft-store.ts', 'export class HttpDraftStore implements DraftStore {}'],
    [
      'src/adapters/http/submit-transport.ts',
      'export class HttpSubmitTransport implements SubmitTransport {}',
    ],
    [
      'src/adapters/http/anonymous-session.ts',
      'export class AnonymousSessionBridge {}\nexport class HttpAnonymousIdentityProvider implements IdentityProvider {}',
    ],
    ['src/adapters/identity/anonymous.ts', 'export class AnonymousAdapter implements IdentityProvider {}'],
    ['src/adapters/identity/oidc.ts', 'export class OidcAdapter implements IdentityProvider {}'],
    [
      'src/adapters/identity/magic-link.ts',
      'export class MagicLinkAdapter implements IdentityProvider {}',
    ],
    ['src/adapters/identity/assurance.ts', 'export class IdentitySession {}'],
  ]) {
    if (path !== options.omitPath) {
      write(root, path, text);
    }
  }

  for (const adapter of options.extraAdapters ?? []) {
    write(root, adapter.path, adapter.text);
  }
}

function defaultComposition() {
  return [
    'import { unavailableRespondentPlaceSource } from "../adapters/unavailable/respondent-place-source.ts";',
    'import { unavailableStatusReader } from "../adapters/unavailable/status-reader.ts";',
    'import { unavailableAttachmentStore } from "../adapters/unavailable/attachment-store.ts";',
    'import { unavailableRespondentHistorySource } from "../adapters/unavailable/respondent-history-source.ts";',
    'export function createDefaultComposition() {',
    '  return {',
    '    respondentPlaceSource: unavailableRespondentPlaceSource(),',
    '    statusReader: unavailableStatusReader(),',
    '    attachmentStore: unavailableAttachmentStore(),',
    '    respondentHistorySource: unavailableRespondentHistorySource(),',
    '  };',
    '}',
  ].join('\n');
}

function publicIndex() {
  return [
    'export {',
    '  defineDefinitionSourceConformance,',
    '  defineDraftStoreConformance,',
    '  defineSubmitTransportConformance,',
    '  defineIdentityProviderConformance,',
    '  defineNotificationDeliveryConformance,',
    '  defineRespondentPlaceSourceConformance,',
    '  defineStatusReaderConformance,',
    '  defineAttachmentStoreConformance,',
    '  defineFormRuntimePolicyExtractorConformance,',
    '  defineRespondentHistorySourceConformance,',
    "} from './conformance.ts';",
  ].join('\n');
}

function conformanceReadme(options) {
  return [
    '# Adapter conformance suites',
    '',
    'Adapter authors import `formspec-web/adapter-conformance`.',
    'Shared fixtures live in `src/adapter-conformance/fixtures.ts`.',
    'The local tests re-export through `tests/adapter-conformance/_framework/conformance.ts`.',
    options.staleReadmeFixtureClaim
      ? 'Fixtures live as JSON cases under `tests/adapter-conformance/<port>/<case>/`.'
      : '',
  ].join('\n');
}

function suiteText(port, registrations, options) {
  return registrations
    .filter(([label]) => label !== options.omitRegistration)
    .map(([label, symbol]) => {
      const renderedSymbol =
        symbol === options.omitSymbol
          ? ''
          : symbol === options.commentOnlySymbol
            ? `OtherAdapter /* ${symbol} */`
            : adapterUsage(symbol);
      return `define${port}Conformance('${label}', () => ${renderedSymbol});`;
    })
    .join('\n');
}

function adapterUsage(symbol) {
  return symbol.startsWith('stub') ? `${symbol}()` : `new ${symbol}()`;
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
