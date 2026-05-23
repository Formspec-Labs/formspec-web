import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDefaultComposition } from '../composition/default.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import { App } from './App.tsx';
import './app.css';
import { CompositionProvider } from './CompositionProvider.tsx';

const composition = createDefaultComposition();
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

applyBrandTheme(document.documentElement);

createRoot(rootEl).render(
  <StrictMode>
    <CompositionProvider value={composition}>
      <App />
    </CompositionProvider>
  </StrictMode>,
);
