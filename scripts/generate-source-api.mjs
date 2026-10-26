import { error, log } from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, {
  COMMENT_HEADER, astToString, tsRecord, STRING, UNKNOWN,
} from 'openapi-typescript';

// A propertyless object with only annotations admits arbitrary properties.
// Delegate closed, structured, composed, and constrained schemas to the generator.
// In particular, nullable is a constraint: the generator owns its null handling.
const openObjectAnnotations = new Set([
  'type', 'description', 'title', '$comment', 'readOnly', 'writeOnly', 'deprecated',
]);

export function openObjectType(schema) {
  if (schema.type === 'object'
    && Object.entries(schema).every(([key, value]) => value === undefined || openObjectAnnotations.has(key))) {
    return tsRecord(STRING, UNKNOWN);
  }
}

async function generate(args) {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--check')) {
    throw new Error('Usage: node scripts/generate-source-api.mjs <public-schema.json> [--check]');
  }
  const input = pathToFileURL(resolve(args[0]));
  const output = new URL('../src/api/generated/source-public.d.ts', import.meta.url);
  const generated = COMMENT_HEADER + astToString(await openapiTS(input, { transform: openObjectType }));
  if (args[1] === '--check') {
    if (await readFile(output, 'utf8') !== generated) {
      error('Generated Source API types are not up-to-date.');
      process.exitCode = 1;
      return;
    }
    log('Generated Source API types are up-to-date.');
    return;
  }
  await writeFile(output, generated);
  log('Generated src/api/generated/source-public.d.ts');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generate(process.argv.slice(2));
}
