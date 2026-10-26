import { error, log } from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { renderApiTypes } from './generate-source-api.mjs';

async function generate(args) {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--check')) {
    throw new Error('Usage: node scripts/generate-wos-api.mjs <public-schema.json> [--check]');
  }
  const input = pathToFileURL(resolve(args[0]));
  const output = new URL('../src/api/generated/wos-public.d.ts', import.meta.url);
  const generated = await renderApiTypes(input);
  if (args[1] === '--check') {
    if (await readFile(output, 'utf8') !== generated) {
      error('Generated WOS API types are not up-to-date.');
      process.exitCode = 1;
      return;
    }
    log('Generated WOS API types are up-to-date.');
    return;
  }
  await writeFile(output, generated);
  log('Generated src/api/generated/wos-public.d.ts');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generate(process.argv.slice(2));
}
