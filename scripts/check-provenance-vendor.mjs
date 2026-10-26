/* global console, process */

// Copies pinned by a `provenance.json`: `files` maps each local file to its stack `source`
// (`<repo>/<path>`) and sha256; `sourceRevisions` records the commit each repo was copied at.
// The check always verifies the pins and compares bytes with each source found beside this
// checkout; a lone checkout (public CI) checks pins only. Setting FORMSPEC_STACK_DIR (root CI)
// makes every source required. `--write` re-copies every file from its committed source and re-pins.
// Positional arguments narrow the run to those vendor directories.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stackRoot = resolve(root, process.env.FORMSPEC_STACK_DIR ?? '..');
const requireSources = process.env.FORMSPEC_STACK_DIR !== undefined;
const args = process.argv.slice(2);
const write = args.includes('--write');
const selected = args.filter(arg => !arg.startsWith('--'));
const dirs = selected.length > 0 ? selected : ['vendor/wos-api', 'vendor/problem-json'];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (repo, ...gitArgs) => spawnSync('git', gitArgs, { cwd: join(stackRoot, repo), encoding: 'utf8' });

let compared = 0;
let pinned = 0;
for (const dir of dirs) {
  const provenancePath = join(root, dir, 'provenance.json');
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  const revisions = { ...provenance.sourceRevisions };
  for (const [file, pin] of Object.entries(provenance.files)) {
    const [repo, ...rest] = pin.source.split('/');
    const sourcePath = join(stackRoot, pin.source);
    const local = join(root, dir, file);
    if (write) {
      if (git(repo, 'status', '--porcelain', '--', rest.join('/')).stdout.trim()) {
        throw new Error(`${pin.source} has uncommitted changes; refusing to pin it.`);
      }
      const head = git(repo, 'rev-parse', 'HEAD');
      if (head.status !== 0) throw new Error(`Cannot record the ${repo} commit.`);
      const bytes = readFileSync(sourcePath);
      writeFileSync(local, bytes);
      pin.sha256 = sha256(bytes);
      revisions[repo] = head.stdout.trim();
    }
    const bytes = readFileSync(local);
    if (sha256(bytes) !== pin.sha256) throw new Error(`${dir}/${file} does not match its provenance pin.`);
    pinned += 1;
    if (existsSync(sourcePath)) {
      if (!readFileSync(sourcePath).equals(bytes)) {
        throw new Error(`${dir}/${file} differs from ${pin.source}; run \`npm run vendor:refresh\`.`);
      }
      compared += 1;
    } else if (requireSources) {
      throw new Error(`${pin.source} is missing under FORMSPEC_STACK_DIR (${stackRoot}).`);
    }
  }
  if (write) {
    provenance.sourceRevisions = revisions;
    writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  }
}
console.log(`provenance vendor ${write ? 'refresh' : 'check'} passed: ${pinned} pinned file(s), ${compared} compared with stack sources`);
