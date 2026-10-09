import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readOperatorFile } from './operator-files.mjs';
import { createServer } from 'node:http';
import { appendFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createRegisteredPhotoProvider } from './provider.mjs';

try {
  const paths = ['FORMSPEC_PHOTO_CONFIG', 'FORMSPEC_PHOTO_POLICY', 'FORMSPEC_PHOTO_JWKS', 'FORMSPEC_PHOTO_RECEIPTS'].map(name => {
    const path = process.env[name]; if (!path || !isAbsolute(path)) throw new Error('explicit absolute operator file required'); return path;
  });
  const [configBytes, policyBytes, jwksBytes] = await Promise.all(paths.slice(0, 3).map(async path => {
    return readOperatorFile(path, 256 * 1024);
  }));
  const handler = await createRegisteredPhotoProvider({ configBytes, policyBytes, jwksBytes,
    receiptSink: async (record, { signal }) => {
      const line = `${JSON.stringify(record)}\n`;
      const lineBytes = Buffer.byteLength(line, 'utf8');
      if (lineBytes > 64 * 1024) throw new Error('receipt exceeds bound');
      const size = await stat(paths[3]).then(value => value.size).catch(error => { if (error.code !== 'ENOENT') throw error; return 0; });
      if (size + lineBytes > 128 * 1024 * 1024) throw new Error('receipt retention budget exhausted');
      await appendFile(paths[3], line, { mode: 0o600, signal });
    } });
  const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 30000, headersTimeout: 5000, keepAliveTimeout: 1000 }, handler);
  server.maxConnections = 4;
  server.maxRequestsPerSocket = 1;
  server.listen(8080, '0.0.0.0'); // Runtime-only deployment entry; no service started by tests.
} catch {
  process.stderr.write('Photo provider refused startup: verify pinned operator files and containment.\n');
  process.exitCode = 1;
}
