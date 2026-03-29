import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** GitHub Pages subpath, e.g. `/reader/`. Set `BASE_PATH=/reader/` for deploy builds. */
function appBase(): string {
  const raw = process.env.BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  const inner = raw.replace(/^\/+|\/+$/g, '')
  return inner ? `/${inner}/` : '/'
}

const base = appBase()

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['lexicons/*.json', 'favicon.svg'],
      manifest: {
        name: 'Progressive Reader',
        short_name: 'Reader',
        description: 'Read EPUBs with progressive language mixing (offline, open source)',
        theme_color: '#1a1a1a',
        background_color: '#faf8f3',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  worker: { format: 'es' },
})
