/// <reference types="vitest/config" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// __dirname isn't a native global in an ESM module (this package is
// "type": "module") — computing it explicitly from import.meta.url is safe
// regardless of how Vite's config loader happens to evaluate this file.
var dirname = path.dirname(fileURLToPath(import.meta.url));
// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        // Mirrors the "@/*" path in tsconfig.json — tsc only type-checks the
        // alias, Vite needs its own copy to resolve it at build/dev time.
        alias: { '@': path.resolve(dirname, './src') },
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'robots.txt'],
            manifest: {
                name: 'Helpcertify',
                short_name: 'Helpcertify',
                description: 'Courses, practice exams, and certification tracking',
                theme_color: '#8a2332',
                background_color: '#f4f4f2',
                display: 'standalone',
                start_url: '/',
                icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
            },
            workbox: {
                // Firestore/Auth/Functions calls go straight to Google's own
                // domains (a different origin), so the app's own service worker
                // never sees them — no same-origin API path to exclude here, unlike
                // the old same-origin REST backend this replaced.
                runtimeCaching: [],
            },
        }),
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
