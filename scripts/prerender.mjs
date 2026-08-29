// Post-build step: turn the SPA's empty-shell index.html into real HTML for
// each public marketing route, and emit sitemap.xml. Runs after both
// `vite build` (client) and `vite build --ssr src/prerender/entry.tsx`.
//
//   dist/index.html         -> prerendered home ("/")
//   dist/<route>/index.html  -> prerendered /about, /privacy, ...
//   dist/app.html            -> the untouched empty shell, which vercel.json
//                               rewrites every client-only route to (so a
//                               deep link like /home/practice-tests still
//                               boots the SPA against an empty #root)
//   dist/sitemap.xml
//
// index.html is used as the template *before* we overwrite it, so the SSR
// bundle and this script are the only new moving parts.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const ORIGIN = 'https://helpcertify.com';

const { renderRoute, MARKETING_ROUTES } = await import(
  pathToFileURL(join(root, '.prerender-tmp/entry.js')).href
);

const template = readFileSync(join(dist, 'index.html'), 'utf-8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('prerender: index.html no longer has an empty <div id="root"></div> to fill');
}

// The empty shell every non-prerendered (client-only) route falls back to.
writeFileSync(join(dist, 'app.html'), template);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function pageHtml(route) {
  const url = route.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${route.path}`;
  const body = renderRoute(route.path);
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[\s\S]*?("\s*\/?>)/,
      `$1${esc(route.description)}$2`,
    )
    .replace(
      /(<meta\s+property="og:title"\s+content=")[\s\S]*?(")/,
      `$1${esc(route.title)}$2`,
    )
    .replace(
      /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
      `$1${esc(route.description)}$2`,
    )
    .replace(/(<meta\s+property="og:url"\s+content=")[\s\S]*?(")/, `$1${url}$2`)
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/,
      `$1${esc(route.description)}$2`,
    )
    .replace(/(<meta\s+name="twitter:url"\s+content=")[\s\S]*?(")/, `$1${url}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[\s\S]*?(")/, `$1${url}$2`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

for (const route of MARKETING_ROUTES) {
  const outDir = route.path === '/' ? dist : join(dist, route.path);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), pageHtml(route));
  console.log(`prerendered ${route.path} -> ${join(outDir, 'index.html').replace(root, '.')}`);
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...MARKETING_ROUTES.map((r) => {
    const loc = r.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${r.path}`;
    return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><priority>${r.priority.toFixed(1)}</priority></url>`;
  }),
  '</urlset>',
  '',
].join('\n');
writeFileSync(join(dist, 'sitemap.xml'), sitemap);
console.log(`wrote sitemap.xml (${MARKETING_ROUTES.length} urls)`);

rmSync(join(root, '.prerender-tmp'), { recursive: true, force: true });
