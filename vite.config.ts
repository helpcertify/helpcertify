/// <reference types="vitest/config" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    // vite-plugin-pwa (VitePWA) used to run here, most recently as a
    // selfDestroying:true kill switch for a past incident (a broken build
    // got precached by the old autoUpdate service worker and stranded
    // visitors on a blank screen). Removed entirely now, not just switched
    // back to autoUpdate — as long as the plugin's registerSW.js kept
    // running on every page load, it re-registered the same
    // self-destroying script every time that script unregistered itself,
    // which forced a reload, which ran registerSW.js again: an
    // unconditional reload loop on every single visit, which is almost
    // certainly why fresh deploys kept failing to show up (the loop's
    // forced reload could race with, and sometimes lose to, the browser's
    // own reload-loop throttling). See public/sw.js for the hand-written
    // replacement that finishes cleaning up any already-registered visitor
    // without ever registering a new one.
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
