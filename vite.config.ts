import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: '@formspec-org/surface-react/formspec-surface.css', replacement: fileURLToPath(new URL('./vendor/formspec-surface-react/dist/formspec-surface.css', import.meta.url)) },
    { find: '@formspec-org/surface-react/widget-metadata', replacement: fileURLToPath(new URL('./vendor/formspec-surface-react/dist/widget-metadata.js', import.meta.url)) },
    { find: '@formspec-org/surface-react/widgets', replacement: fileURLToPath(new URL('./vendor/formspec-surface-react/dist/widgets/index.js', import.meta.url)) },
    { find: '@formspec-org/surface-react', replacement: fileURLToPath(new URL('./vendor/formspec-surface-react/dist/index.js', import.meta.url)) },
  ] },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx,js,mjs}', 'src/**/*.test.{ts,tsx}'],
  },
});
