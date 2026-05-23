import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDefaultComposition } from '../composition/default.ts';
import { App } from './App.tsx';
import { CompositionProvider } from './CompositionProvider.tsx';

const composition = createDefaultComposition();
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <CompositionProvider value={composition}>
      <App />
    </CompositionProvider>
  </StrictMode>,
);
