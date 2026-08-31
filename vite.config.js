import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import { fileURLToPath } from 'node:url'

/* Percorso relativo a questo file. NON `import.meta.dirname`: esiste solo da
   Node 20.11, e su una versione precedente sarebbe `undefined` — `resolve()`
   riceverebbe undefined e la build morirebbe, in un ambiente che non è quello
   dove la provi. Questa forma funziona da Node 18. */
const qui = (file) => fileURLToPath(new URL(file, import.meta.url))

export default defineConfig({
  /* Seconda pagina statica: la privacy ha un URL vero e citabile senza tirare
     dentro l'app. Non c'è routing client-side, quindi un secondo ingresso è la
     via più economica — Cloudflare la serve come file, niente React da montare
     per chi arriva solo a leggerla. */
  build: {
    rollupOptions: {
      input: { main: qui('index.html'), privacy: qui('privacy.html') },
    },
  },
  // Il worker di MapLibre è ESM: senza questo Vite lo impacchetta come IIFE.
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      devOptions: { enabled: true },
      manifest: {
        name: 'AtmoLab',
        short_name: 'AtmoLab',
        description:
          'Confronto delle previsioni dei principali modelli meteo globali e regionali, con rischio grandine.',
        lang: 'it',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.png', sizes: '96x96', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // Previsioni: la rete vince sempre, la cache è solo rete di sicurezza.
            // La scadenza a 30 minuti è la stessa soglia del LED in topbar.
            urlPattern: /^https:\/\/(api|air-quality-api|geocoding-api)\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'open-meteo',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /* Mappa: tile vettoriali, stile, font e sprite stanno tutti sullo
               stesso host OpenFreeMap. Cambiano quasi mai, cache prima di tutto.
               Le voci scendono da 400 a 200: un .pbf pesa molto più di un .png
               raster, e 400 avrebbero riempito centinaia di MB di storage. */
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5180, open: true },
})
