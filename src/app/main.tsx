import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import rootConfig from '../../formspec.config.ts';
import { createDefaultComposition } from '../composition/default.ts';
import { readRuntimeConfig, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import '../theme/upstream/adapters/tailwind-formspec-core.css';
import { App } from './App.tsx';
import './app.css';
import { CompositionProvider } from './CompositionProvider.tsx';

await initFormspecEngine();

const activeConfig = resolveActiveConfig(rootConfig, readRuntimeConfig());
const composition = createDefaultComposition(activeConfig);
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

applyBrandTheme(document.documentElement, activeConfig.brand);

createRoot(rootEl).render(
  <StrictMode>
    <CompositionProvider value={composition}>
      <App config={activeConfig} />
    </CompositionProvider>
  </StrictMode>,
);
