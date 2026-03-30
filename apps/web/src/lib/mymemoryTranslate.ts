/**
 * MyMemory free translation API (EN→ES). Optional `VITE_MYMEMORY_EMAIL` raises daily quota.
 * Results for full paragraphs are cached in IndexedDB (same English text → no repeat request).
 *
 * We do **not** send the whole book in one call: URL/query limits, timeouts, and the fact that MT
 * output does not align 1:1 with source offsets make it impossible to “slice” one giant Spanish
 * blob back onto each paragraph reliably. Caching per block text is the safe way to cut quota.
 *
 * Optional `VITE_MYMEMORY_MIN_INTERVAL_MS` (milliseconds, default 10000): minimum time between the
 * end of one MyMemory request and the start of the next, for the whole app. A small random jitter
 * is added so requests do not line up with other users. Replace mode chains many calls; use tap
 * mode or `VITE_MYMEMORY_EMAIL` if you still see HTTP 429.
 *
 * Dev-only: set `VITE_MYMEMORY_USE_DEV_PROXY=true` to send traffic via Vite’s `/api/mymemory`
 * proxy (only if the browser blocks direct calls).
 *
 * **Google Cloud Translation (optional, paid):** same API as `google.cloud.translate_v2.Client`
 * ([Basic v2 REST](https://cloud.google.com/translate/docs/reference/rest/v2/translate)). When
 * `VITE_GOOGLE_TRANSLATE_API_KEY` is set, the app tries **Google first** for each segment, then
 * falls back to MyMemory → Libre on failure. Paragraphs use larger chunks than MyMemory (see
 * `chunkTextForGoogleCloud`). **Security:** a `VITE_*` key is embedded in the production bundle—use
 * GCP “Application restrictions” (HTTP referrers) or a small backend; in dev,
 * `VITE_GOOGLE_TRANSLATE_USE_DEV_PROXY=true` with `GOOGLE_TRANSLATE_API_KEY` in `.env` keeps the key
 * on the Vite server only (`/api/google-translate` proxy).
 *
 * **Backup:** when MyMemory returns a quota / daily-limit response (including JSON `responseStatus`
 * 429 with a warning body), the app retries the same segment via a **LibreTranslate**-compatible
 * POST (`VITE_LIBRETRANSLATE_URL`, default `https://libretranslate.com`). Public instances may
 * also rate-limit; optional `VITE_LIBRETRANSLATE_API_KEY` if your instance requires it. Disable with
 * `VITE_DISABLE_LIBRETRANSLATE_FALLBACK=true`. In dev, `VITE_LIBRETRANSLATE_USE_DEV_PROXY=true`
 * sends LibreTranslate via Vite’s `/api/libretranslate` proxy if the browser blocks CORS.
 *
 * @see https://mymemory.translated.net/doc/spec.php
 * @see https://libretranslate.com
 * @see https://cloud.google.com/translate/docs/reference/rest/v2/translate
 */

import {
  getCachedTranslationEs,
  setCachedTranslationEs,
  translationCacheKey,
} from './db'

const MYMEMORY_GET = 'https://api.mymemory.translated.net/get'

/** Free-tier quota, daily cap, or sustained HTTP 429 after retries. */
export class MyMemoryQuotaExceededError extends Error {
  override readonly name = 'MyMemoryQuotaExceededError'
  constructor(message: string) {
    super(message)
  }
}

export function isMyMemoryQuotaExceededError(e: unknown): e is MyMemoryQuotaExceededError {
  return e instanceof MyMemoryQuotaExceededError
}

function isQuotaLikeResponseDetail(detail: string, responseStatus: number): boolean {
  if (responseStatus === 403 || responseStatus === 429) return true
  return /quota|limit exceeded|daily|characters|too many|rate limit/i.test(detail)
}

function isMyMemoryWarningTranslatedText(text: string): boolean {
  const low = text.toLowerCase()
  return low.includes('mymemory') && (low.includes('warning') || low.includes('quota'))
}

function libreFallbackEnabled(): boolean {
  const v = import.meta.env.VITE_DISABLE_LIBRETRANSLATE_FALLBACK
  return v !== 'true' && v !== '1'
}

function libreTranslateEndpoint(): string {
  const raw = import.meta.env.VITE_LIBRETRANSLATE_URL?.trim()
  const base = raw && raw.length > 0 ? raw.replace(/\/$/, '') : 'https://libretranslate.com'
  return base.endsWith('/translate') ? base : `${base}/translate`
}

function libreTranslateRequestUrl(): string {
  const proxy =
    import.meta.env.DEV && import.meta.env.VITE_LIBRETRANSLATE_USE_DEV_PROXY === 'true'
  if (proxy) return '/api/libretranslate'
  return libreTranslateEndpoint()
}

/** Injected by Vite from whether a Google API key was present when the dev server started. */
declare const __GOOGLE_PROXY_KEY_SET__: boolean

function googleTranslateUseDevProxy(): boolean {
  return (
    import.meta.env.DEV &&
    import.meta.env.VITE_GOOGLE_TRANSLATE_USE_DEV_PROXY === 'true' &&
    __GOOGLE_PROXY_KEY_SET__
  )
}

/** True when Google Cloud Translation should be tried before MyMemory (paid API key or dev proxy). */
export function googleTranslateEnabled(): boolean {
  const key = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY?.trim() ?? ''
  if (key.length > 0) return true
  return googleTranslateUseDevProxy()
}

function googleMinIntervalMs(): number {
  const raw = import.meta.env.VITE_GOOGLE_TRANSLATE_MIN_INTERVAL_MS
  if (typeof raw === 'string' && raw.trim()) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function googleTranslateRequestUrl(): string {
  if (googleTranslateUseDevProxy()) return '/api/google-translate'
  const key = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY?.trim() ?? ''
  return `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`
}

type GoogleTranslateV2Response = {
  data?: { translations?: Array<{ translatedText?: string }> }
  error?: { message?: string; code?: number; status?: string }
}

/**
 * Cloud Translation API v2 (Basic), same service as the Python `translate_v2.Client`.
 */
async function translateEnToEsGoogleUnqueued(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const useProxy = googleTranslateUseDevProxy()
  const key = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY?.trim() ?? ''
  if (!useProxy && !key) {
    throw new Error(
      'Google Translate: set VITE_GOOGLE_TRANSLATE_API_KEY, or dev proxy + GOOGLE_TRANSLATE_API_KEY.',
    )
  }

  const url = googleTranslateRequestUrl()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: trimmed,
      source: 'en',
      target: 'es',
      format: 'text',
    }),
  })

  const rawBody = await res.text()
  let data: GoogleTranslateV2Response = {}
  try {
    data = JSON.parse(rawBody) as GoogleTranslateV2Response
  } catch {
    /* ignore */
  }

  const apiMsg = data.error?.message?.trim()
  if (!res.ok) {
    throw new Error(
      `Google Translate HTTP ${res.status}${apiMsg ? `: ${apiMsg}` : rawBody ? `: ${rawBody.slice(0, 200)}` : ''}`,
    )
  }
  if (data.error) {
    throw new Error(apiMsg || 'Google Translate API error.')
  }

  const out = data.data?.translations?.[0]?.translatedText?.trim()
  if (!out) throw new Error('Google Translate returned empty translation.')
  return out
}

/**
 * LibreTranslate-compatible JSON API (used when MyMemory quota is exhausted).
 * @see https://github.com/LibreTranslate/LibreTranslate
 */
async function translateEnToEsLibreUnqueued(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const url = libreTranslateRequestUrl()
  const apiKey = import.meta.env.VITE_LIBRETRANSLATE_API_KEY?.trim() ?? ''

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: trimmed,
      source: 'en',
      target: 'es',
      format: 'text',
      ...(apiKey ? { api_key: apiKey } : {}),
    }),
  })

  const rawBody = await res.text()
  let data: { translatedText?: string; error?: string } = {}
  try {
    data = JSON.parse(rawBody) as { translatedText?: string; error?: string }
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(
      `LibreTranslate HTTP ${res.status}${data.error ? `: ${data.error}` : rawBody ? `: ${rawBody.slice(0, 160)}` : ''}`,
    )
  }
  if (data.error) {
    throw new Error(String(data.error))
  }
  const out = data.translatedText?.trim()
  if (!out) throw new Error('LibreTranslate returned empty translation.')
  return out
}


export type MyMemoryJson = {
  responseData?: { translatedText?: string }
  responseStatus?: number
  responseDetails?: string
}

function myMemoryRequestUrl(query: string): string {
  const proxy =
    import.meta.env.DEV && import.meta.env.VITE_MYMEMORY_USE_DEV_PROXY === 'true'
  if (proxy) return `/api/mymemory?${query}`
  return `${MYMEMORY_GET}?${query}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Wait after HTTP 429 before retry; honors Retry-After when it is a small integer (seconds). */
function backoffMsAfter429(attempt: number, res: Response): number {
  const ra = res.headers.get('Retry-After')
  if (ra) {
    const sec = parseInt(ra, 10)
    if (!Number.isNaN(sec) && sec > 0 && sec < 600) {
      return sec * 1000
    }
  }
  return Math.min(180_000, 6_000 * 2 ** (attempt - 1))
}

function pacingJitterMs(): number {
  return Math.floor(Math.random() * 2_500)
}

/**
 * Split for MyMemory `q` parameter (UTF-8 **bytes**, max 500 per their spec — stay under that).
 */
export function chunkTextForMyMemory(text: string, maxUtf8Bytes = 450): string[] {
  const t = text.trim()
  if (!t) return []
  const enc = new TextEncoder()
  if (enc.encode(t).length <= maxUtf8Bytes) return [t]

  const chunks: string[] = []
  let start = 0
  while (start < t.length) {
    let lo = start + 1
    let hi = t.length
    let best = start + 1
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const slice = t.slice(start, mid)
      const len = enc.encode(slice).length
      if (len <= maxUtf8Bytes) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    let end = best
    if (end <= start) end = Math.min(start + 1, t.length)
    if (end < t.length) {
      const sp = t.lastIndexOf(' ', end)
      if (sp > start) end = sp
    }
    const part = t.slice(start, end).trim()
    if (part) chunks.push(part)
    let next = end
    while (next < t.length && t[next] === ' ') next++
    if (next === start) next = start + 1
    start = next
  }
  return chunks
}

/**
 * Chunk plain text for Cloud Translation v2 (much higher per-request limits than MyMemory).
 * Stays under a conservative character budget and splits on spaces when possible.
 */
export function chunkTextForGoogleCloud(text: string, maxChars = 8000): string[] {
  const t = text.trim()
  if (!t) return []
  if (t.length <= maxChars) return [t]

  const chunks: string[] = []
  let start = 0
  while (start < t.length) {
    let end = Math.min(start + maxChars, t.length)
    if (end < t.length) {
      const sp = t.lastIndexOf(' ', end)
      if (sp > start) end = sp
    }
    const part = t.slice(start, end).trim()
    if (part) chunks.push(part)
    let next = end
    while (next < t.length && t[next] === ' ') next++
    if (next === start) next = start + 1
    start = next
  }
  return chunks
}

const MYMEMORY_429_MAX_ATTEMPTS = 8

function minIntervalBetweenCallsMs(): number {
  const raw = import.meta.env.VITE_MYMEMORY_MIN_INTERVAL_MS
  if (typeof raw === 'string' && raw.trim()) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 10_000
}

/** One translation at a time; space out calls so the free API is not hammered. */
let myMemoryQueue: Promise<unknown> = Promise.resolve()
let lastMyMemoryRequestEndedAt = 0

async function waitForTranslatePacing(minGapMs: number): Promise<void> {
  if (minGapMs <= 0) return
  const jitter = pacingJitterMs()
  if (lastMyMemoryRequestEndedAt === 0) {
    await sleep(minGapMs + jitter)
  } else {
    const wait = lastMyMemoryRequestEndedAt + minGapMs + jitter - Date.now()
    if (wait > 0) await sleep(wait)
  }
}

async function translateEnToEsMyMemoryUnqueued(
  url: string,
): Promise<string> {
  for (let attempt = 1; attempt <= MYMEMORY_429_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url)

    if (res.status === 429) {
      if (attempt >= MYMEMORY_429_MAX_ATTEMPTS) {
        throw new MyMemoryQuotaExceededError(
          'MyMemory rate limit (HTTP 429) after retries. The free daily quota for your IP may be used up—try again tomorrow, set VITE_MYMEMORY_EMAIL in .env, or use “tap to show Spanish” with a longer VITE_MYMEMORY_MIN_INTERVAL_MS.',
        )
      }
      await sleep(backoffMsAfter429(attempt, res))
      continue
    }

    if (!res.ok) {
      throw new Error(`Translation failed (HTTP ${res.status}).`)
    }

    const data = (await res.json()) as MyMemoryJson
    const st = data.responseStatus
    const earlyOut = data.responseData?.translatedText?.trim()
    if (earlyOut && isMyMemoryWarningTranslatedText(earlyOut)) {
      throw new MyMemoryQuotaExceededError(
        (data.responseDetails ?? '').trim() ||
          'MyMemory free translations for today are used up (see response text).',
      )
    }
    if (typeof st === 'number' && st !== 200) {
      const detail = (data.responseDetails ?? '').trim()
      if (isQuotaLikeResponseDetail(detail, st)) {
        throw new MyMemoryQuotaExceededError(
          detail || `MyMemory returned status ${st} (free tier limit may apply).`,
        )
      }
      throw new Error(detail || `MyMemory error (${st}).`)
    }
    const out = earlyOut
    if (!out) throw new Error('Translation response was empty.')

    if (isMyMemoryWarningTranslatedText(out)) {
      throw new MyMemoryQuotaExceededError(
        'Translation quota may be exceeded. Set VITE_MYMEMORY_EMAIL for a higher free limit, or try again later.',
      )
    }

    return out
  }

  throw new Error('Translation failed after retries.')
}

export async function translateEnToEsMyMemory(chunk: string): Promise<string> {
  const trimmed = chunk.trim()
  if (!trimmed) return ''

  const email = import.meta.env.VITE_MYMEMORY_EMAIL
  const params = new URLSearchParams({
    q: trimmed,
    langpair: 'en|es',
  })
  if (typeof email === 'string' && email.includes('@')) {
    params.set('de', email.trim())
  }
  const url = myMemoryRequestUrl(params.toString())

  const minGap = minIntervalBetweenCallsMs()
  const run = myMemoryQueue.then(async () => {
    try {
      if (googleTranslateEnabled()) {
        await waitForTranslatePacing(googleMinIntervalMs())
        try {
          return await translateEnToEsGoogleUnqueued(trimmed)
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn(
              '[translate] Google Cloud failed; falling back to MyMemory (then Libre on quota).',
              err instanceof Error ? err.message : err,
            )
          }
          /* fall through to MyMemory */
        }
      }

      await waitForTranslatePacing(minGap)
      try {
        return await translateEnToEsMyMemoryUnqueued(url)
      } catch (e) {
        if (libreFallbackEnabled() && isMyMemoryQuotaExceededError(e)) {
          try {
            return await translateEnToEsLibreUnqueued(trimmed)
          } catch (libreErr) {
            throw new MyMemoryQuotaExceededError(
              `${e.message}\n\nBackup (LibreTranslate) failed: ${libreErr instanceof Error ? libreErr.message : String(libreErr)}`,
            )
          }
        }
        throw e
      }
    } finally {
      lastMyMemoryRequestEndedAt = Date.now()
    }
  })
  myMemoryQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export type TranslateParagraphOptions = {
  pairId?: string
  /** Pause between chunk requests; use higher values when translating many blocks in a row. */
  interChunkDelayMs?: number
}

/**
 * Translate a full EPUB block’s plain text (chunked + short delays). Primary: Google (if
 * configured), else MyMemory; on MyMemory quota, optional LibreTranslate backup. Uses IndexedDB
 * cache keyed by normalized text + pair id.
 */
export async function translatePlainEnglishParagraph(
  plain: string,
  options?: TranslateParagraphOptions,
): Promise<string> {
  const pairId = options?.pairId ?? 'en-es'
  const interChunkDelayMs = options?.interChunkDelayMs ?? 160
  const trimmed = plain.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''

  const key = await translationCacheKey(trimmed, pairId)

  try {
    const cached = await getCachedTranslationEs(key)
    if (cached !== undefined) return cached
  } catch {
    /* IDB blocked — still translate */
  }

  const chunks = googleTranslateEnabled()
    ? chunkTextForGoogleCloud(trimmed)
    : chunkTextForMyMemory(trimmed)
  if (chunks.length === 0) return ''
  const parts: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    parts.push(await translateEnToEsMyMemory(chunks[i]!))
    if (i < chunks.length - 1) await sleep(interChunkDelayMs)
  }
  const out = parts.join(' ').replace(/\s+/g, ' ').trim()
  try {
    await setCachedTranslationEs(key, pairId, out)
  } catch {
    /* ignore cache write failure */
  }
  return out
}
