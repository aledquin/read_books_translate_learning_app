import { defineConfig, loadEnv } from 'vite'
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleKey =
    (env.GOOGLE_TRANSLATE_API_KEY ?? env.VITE_GOOGLE_TRANSLATE_API_KEY ?? '').trim()

  if (
    mode === 'development' &&
    env.VITE_GOOGLE_TRANSLATE_USE_DEV_PROXY === 'true' &&
    !googleKey
  ) {
    console.warn(
      '\n[vite] Translation: VITE_GOOGLE_TRANSLATE_USE_DEV_PROXY is on but no GOOGLE_TRANSLATE_API_KEY (or VITE_GOOGLE_TRANSLATE_API_KEY) in .env. Google is skipped; MyMemory (strict daily limits) and LibreTranslate are used.\n',
    )
  }

  return {
    define: {
      /** True when the dev server can append a key to /api/google-translate (see loadEnv above). */
      __GOOGLE_PROXY_KEY_SET__: JSON.stringify(googleKey.length > 0),
    },
    base,
    server: {
      proxy: {
        // Same-origin in dev so translation works even if the browser blocks cross-origin calls.
        '/api/mymemory': {
          target: 'https://api.mymemory.translated.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mymemory/, '/get'),
        },
        '/api/libretranslate': {
          target: 'https://libretranslate.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/libretranslate/, '/translate'),
        },
        // Dev-only: browser POSTs JSON here; key is appended server-side (not in the bundle).
        '/api/google-translate': {
          target: 'https://translation.googleapis.com',
          changeOrigin: true,
          rewrite: () =>
            `/language/translate/v2?key=${encodeURIComponent(googleKey)}`,
        },
      },
    },
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
  }
})
