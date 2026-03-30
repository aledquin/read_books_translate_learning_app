/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional email for higher MyMemory free-tier daily quota (see MyMemory docs). */
  readonly VITE_MYMEMORY_EMAIL?: string
  /** Min ms between MyMemory requests app-wide (default 10000). Set 0 to disable spacing (not recommended). */
  readonly VITE_MYMEMORY_MIN_INTERVAL_MS?: string
  /** In dev, route MyMemory via Vite /api/mymemory proxy instead of direct HTTPS. */
  readonly VITE_MYMEMORY_USE_DEV_PROXY?: string
  /** Base URL for LibreTranslate fallback (default https://libretranslate.com). */
  readonly VITE_LIBRETRANSLATE_URL?: string
  /** API key if your LibreTranslate instance requires it. */
  readonly VITE_LIBRETRANSLATE_API_KEY?: string
  /** Set true to disable LibreTranslate when MyMemory quota is hit. */
  readonly VITE_DISABLE_LIBRETRANSLATE_FALLBACK?: string
  /** In dev, POST /api/libretranslate → libretranslate.com (CORS bypass). */
  readonly VITE_LIBRETRANSLATE_USE_DEV_PROXY?: string
  /** Google Cloud Translation API key (Basic v2); embedded in production build—restrict in GCP. */
  readonly VITE_GOOGLE_TRANSLATE_API_KEY?: string
  /** In dev, POST /api/google-translate with key from GOOGLE_TRANSLATE_API_KEY (server-only). */
  readonly VITE_GOOGLE_TRANSLATE_USE_DEV_PROXY?: string
  /** Min ms between Google requests when using that provider (default 0). */
  readonly VITE_GOOGLE_TRANSLATE_MIN_INTERVAL_MS?: string
}
