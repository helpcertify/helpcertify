/// <reference types="vitest/config" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// __dirname isn't a native global in an ESM module (this package is
// "type": "module") — computing it explicitly from import.meta.url is safe
// regardless of how Vite's config loader happens to evaluate this file.
const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json — tsc only type-checks the
    // alias, Vite needs its own copy to resolve it at build/dev time.
    alias: { '@': path.resolve(dirname, './src') },
  },
  plugins: [
    react(),
    // selfDestroying: true — temporary kill switch, not a config oversight.
    // A real production bug (missing Firebase env vars) shipped briefly and
    // got precached by the old autoUpdate service worker on anyone who
    // loaded the site during that window; the crash happens before React
    // ever mounts, so the normal update-check-and-reload flow never gets a
    // chance to run and those visitors are stuck on a permanently blank
    // black screen. selfDestroying ships a service worker whose only job is
    // to unregister itself and purge every cache it finds — every affected
    // visitor recovers on their next load, no manual cache-clearing needed.
    // Safe to switch back to the normal registerType: 'autoUpdate' config
    // (see git history) once this has been live for a while and stale
    // installs have had a chance to clear.
    VitePWA({ selfDestroying: true }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    css: true,
  },
});
