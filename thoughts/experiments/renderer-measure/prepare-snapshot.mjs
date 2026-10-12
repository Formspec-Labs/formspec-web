import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(directory, '../../..');
const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot-receipt.json'), 'utf8'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const entry of receipt) {
  const target = path.resolve(root, entry.snapshot);
  if (!target.startsWith(path.join(root, 'output/playwright/renderer-measure-prebuilt') + path.sep)) throw new Error('Snapshot target outside experiment');
  const bytes = fs.existsSync(target) ? fs.readFileSync(target) : fs.readFileSync(entry.source);
  if (digest(bytes) !== entry.sha256) throw new Error(`Pinned asset differs: ${entry.source}`);
  if (!fs.existsSync(target)) { fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, bytes); }
}
console.log(`Verified/restored ${receipt.length} pinned prebuilt files. No package/WASM builds.`);
