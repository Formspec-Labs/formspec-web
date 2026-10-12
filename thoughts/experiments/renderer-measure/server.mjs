import { createServer } from 'vite';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const server = await createServer({ configFile: false, root, cacheDir: path.join(root, '.vite-cache'), plugins: [{ name: 'pinned-packages', resolveId(id, importer) { if (!id.startsWith('@formspec-org/') || !importer?.includes('renderer-measure-prebuilt')) return; const arm = importer.includes('/wc/') ? 'wc' : 'react'; const [pkg, ...rest] = id.slice('@formspec-org/'.length).split('/'); const file = pkg === 'engine' && rest[0] === 'init-formspec-engine' ? 'dist/init-formspec-engine.js' : 'dist/index.js'; return path.resolve(root, '../../../output/playwright/renderer-measure-prebuilt', arm, 'formspec-' + pkg, file); } }], optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 5187, strictPort: true, fs: { allow: [path.resolve(root, '../../..'), path.resolve(root, '../../../../formspec')] } } });
await server.listen();
console.log('renderer probe listening at http://127.0.0.1:5187');
