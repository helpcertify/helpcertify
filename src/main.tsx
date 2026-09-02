import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './app/App';
import { startAutoUpdate } from '@/lib/autoUpdate';
import '@/styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in index.html');

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Public marketing routes ship with real prerendered markup inside #root
// (see scripts/prerender.mjs) - hydrate those. Every client-only route
// falls back to app.html with an empty #root - mount fresh there.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}

startAutoUpdate();
