// Build-time entry used only by scripts/prerender.mjs (via `vite build
// --ssr`). Renders each public marketing route to an HTML string so the
// deploy can ship real, crawlable content for those pages instead of an
// empty <div id="root">. Must not import anything that touches the browser
// at module-load time (theme store, Firebase) — the marketing routes are
// deliberately kept free of those; see src/features/marketing/routes.tsx.
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { MARKETING_ROUTES } from '@/features/marketing/routes';

export function renderRoute(path: string): string {
  const route = MARKETING_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`prerender: no marketing route registered for "${path}"`);
  return renderToString(<StaticRouter location={path}>{route.element}</StaticRouter>);
}

export { MARKETING_ROUTES };
