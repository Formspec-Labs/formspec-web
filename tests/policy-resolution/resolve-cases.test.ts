import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeFeatures } from '../../src/policy/resolver.ts';
import { isRuntimePolicyError } from '../../src/policy/errors.ts';
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../../src/policy/policy-shapes.ts';

interface CaseFile {
  readonly name: string;
  readonly description: string;
  readonly mode: 'demo' | 'production';
  readonly instance: InstanceCapabilities;
  readonly org: OrgRuntimePolicy;
  readonly form: FormRuntimePolicy;
  readonly expect:
    | { kind: 'throws'; code: string }
    | {
        kind: 'profile';
        enabled: string[];
        disabled: Record<string, string>;
      };
}

const here = dirname(fileURLToPath(import.meta.url));
const casesDir = join(here, 'cases');
const cases = readdirSync(casesDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(join(casesDir, file), 'utf8')) as CaseFile);

describe('runtime feature resolution — fixture cases', () => {
  for (const c of cases) {
    it(`${c.name}: ${c.description}`, () => {
      if (c.expect.kind === 'throws') {
        try {
          resolveRuntimeFeatures(c);
          throw new Error('expected resolver to throw');
        } catch (err) {
          if (!isRuntimePolicyError(err)) throw err;
          expect(err.code).toBe(c.expect.code);
        }
        return;
      }
      const profile = resolveRuntimeFeatures(c);
      expect([...profile.enabled].sort()).toEqual([...c.expect.enabled].sort());
      for (const [key, cause] of Object.entries(c.expect.disabled)) {
        expect(profile.disabled.get(key as never)?.cause).toBe(cause);
      }
    });
  }
});
