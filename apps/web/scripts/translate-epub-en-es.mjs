/**
 * Build a Spanish companion EPUB from English: same ZIP layout, translated text in spine XHTML.
 * Preserves block tags (p, h1–h4, blockquote, li) and structure for attachSpanishCompanionBlocks.
 *
 * Usage (from apps/web):
 *   node scripts/translate-epub-en-es.mjs --in ../../fixtures/epub/white-nights-fyodor-dostoevsky.epub --out ../../fixtures/epub/white-nights-fyodor-dostoevsky.es.epub
 *
 * Options:
 *   --cache <file>     JSON map en→es to resume / dedupe (default: alongside out with .cache.json)
 *   --min-interval-ms  Minimum gap between upstream translation calls (default: 450)
 *   --dry-run          Only print spine file list and unique segment counts; no writes
 *
 * Translation order (first success wins):
 *   1. GOOGLE_TRANSLATE_API_KEY → Cloud Translation v2
 *   2. Else @vitalets/google-translate-api (unofficial web client; disable with DISABLE_VITALETS_TRANSLATE=1)
 *   3. Else LIBRETRANSLATE_URL + LIBRETRANSLATE_API_KEY → official-style POST
 *   4. Else MyMemory (450-byte UTF-8 chunks)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { TextEncoder } from 'node:util'
import { DOMParser } from 'linkedom'
import { translate as translateVitalets } from '@vitalets/google-translate-api'
import JSZip from 'jszip'

const SELECTOR = 'p, h1, h2, h3, h4, blockquote, li'

function parseArgs(argv) {
  const o = {
    inPath: '',
    outPath: '',
    cachePath: '',
    minIntervalMs: 450,
    dryRun: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--in') o.inPath = argv[++i] ?? ''
    else if (a === '--out') o.outPath = argv[++i] ?? ''
    else if (a === '--cache') o.cachePath = argv[++i] ?? ''
    else if (a === '--min-interval-ms') o.minIntervalMs = Math.max(0, parseInt(argv[++i] ?? '0', 10) || 0)
    else if (a === '--dry-run') o.dryRun = true
  }
  return o
}

function dirnameZip(path) {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '' : path.slice(0, i)
}

function resolveHref(opfPath, href) {
  const base = dirnameZip(opfPath)
  const clean = href.split('#')[0]?.split('?')[0] ?? ''
  const stack = base ? base.split('/').filter(Boolean) : []
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return stack.join('/')
}

function parseContainerForOpf(containerXml) {
  const m = containerXml.match(/full-path\s*=\s*"([^"]+)"/i)
  return m?.[1]?.trim() ?? null
}

function parseManifest(opf) {
  const map = new Map()
  const itemRe = /<item\b([^>]*?)(?:\/>|>)/gis
  let m
  while ((m = itemRe.exec(opf)) !== null) {
    const chunk = m[1] ?? ''
    const idM = /\bid\s*=\s*"([^"]+)"/i.exec(chunk)
    const hrefM = /\bhref\s*=\s*"([^"]+)"/i.exec(chunk)
    if (!idM?.[1] || !hrefM?.[1]) continue
    const propM = /\bproperties\s*=\s*"([^"]*)"/i.exec(chunk)
    map.set(idM[1], { href: hrefM[1], properties: propM?.[1] ?? '' })
  }
  return map
}

function parseSpineIds(opf) {
  const ids = []
  const re = /<itemref\b[^>]*\bidref\s*=\s*"([^"]+)"/gi
  let m
  while ((m = re.exec(opf)) !== null) ids.push(m[1])
  return ids
}

function shouldSkipSpineSection(href, properties) {
  const props = properties ? properties.split(/\s+/) : []
  if (props.some((p) => p.toLowerCase() === 'nav')) return true
  const path = href.split('#')[0]?.split('?')[0] ?? ''
  const seg = path.split('/').pop()?.toLowerCase() ?? ''
  if (!seg) return false
  return (
    /^(index|toc|contents)\.(xhtml|html|htm|xml)$/i.test(seg) ||
    /^table[_-]?of[_-]?contents\.(xhtml|html|htm|xml)$/i.test(seg)
  )
}

function chunkTextForMyMemory(text, maxUtf8Bytes = 450) {
  const enc = new TextEncoder()
  const t = text.trim()
  if (!t) return []
  if (enc.encode(t).length <= maxUtf8Bytes) return [t]
  const chunks = []
  let start = 0
  while (start < t.length) {
    let end = Math.min(start + maxUtf8Bytes, t.length)
    while (end > start && enc.encode(t.slice(start, end)).length > maxUtf8Bytes) end--
    if (end <= start) end = Math.min(start + 1, t.length)
    let part = t.slice(start, end).trim()
    if (end < t.length) {
      const lastSpace = part.lastIndexOf(' ')
      if (lastSpace > part.length * 0.5) part = part.slice(0, lastSpace).trim()
    }
    if (part) chunks.push(part)
    start = end
    while (start < t.length && t[start] === ' ') start++
  }
  return chunks
}

let lastCallEnd = 0
async function pace(minMs) {
  if (minMs <= 0) return
  const now = Date.now()
  const wait = minMs - (now - lastCallEnd)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

function markCallEnd() {
  lastCallEnd = Date.now()
}

async function translateGoogle(text, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'en', target: 'es', format: 'text' }),
  })
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`)
  const j = await res.json()
  const out = j?.data?.translations?.[0]?.translatedText
  if (typeof out !== 'string') throw new Error('Google: bad JSON')
  return out
}

async function translateLibre(text, endpoint, apiKey) {
  const body = { q: text, source: 'en', target: 'es', format: 'text' }
  if (apiKey) body.api_key = apiKey
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Libre HTTP ${res.status}`)
  const j = await res.json()
  if (typeof j.translatedText !== 'string') throw new Error('Libre: bad JSON')
  return j.translatedText
}

async function translateMyMemoryChunk(text) {
  const q = encodeURIComponent(text)
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=en|es`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`)
  const j = await res.json()
  const status = j.responseStatus
  if (status !== 200) throw new Error(`MyMemory status ${status}: ${j.responseDetails ?? ''}`)
  const out = j.responseData?.translatedText
  if (typeof out !== 'string') throw new Error('MyMemory: no text')
  const low = out.toLowerCase()
  if (low.includes('mymemory') && (low.includes('quota') || low.includes('limit')))
    throw new Error('MyMemory quota message in body')
  return out
}

const VITALETS_MAX_CHARS = Number(process.env.VITALETS_MAX_CHARS || 2800) || 2800

function splitForVitalets(text) {
  const t = text.trim()
  if (t.length <= VITALETS_MAX_CHARS) return [t]
  const parts = []
  let i = 0
  while (i < t.length) {
    let end = Math.min(i + VITALETS_MAX_CHARS, t.length)
    if (end < t.length) {
      const cut = t.lastIndexOf('. ', end)
      if (cut > i + 800) end = cut + 1
      else {
        const sp = t.lastIndexOf(' ', end)
        if (sp > i) end = sp
      }
    }
    const slice = t.slice(i, end).trim()
    if (slice) parts.push(slice)
    i = end
  }
  return parts.length ? parts : [t]
}

async function sleepMs(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

function vitaletsHost() {
  return (process.env.VITALETS_HOST || 'translate.google.com').trim() || 'translate.google.com'
}

async function translateVitaletsWithRetries(chunk, attempts = 22) {
  const host = vitaletsHost()
  let lastErr
  for (let a = 0; a < attempts; a++) {
    try {
      const { text: es } = await translateVitalets(chunk, { from: 'en', to: 'es', host })
      return es
    } catch (e) {
      lastErr = e
      const backoff = Math.min(120_000, 4000 + 2500 * a * a)
      await sleepMs(backoff)
    }
  }
  throw lastErr ?? new Error('translateVitaletsWithRetries: unknown error')
}

async function translateVitaletsSegment(text) {
  const chunks = splitForVitalets(text)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleepMs(250)
    out.push(await translateVitaletsWithRetries(chunks[i]))
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

async function translatePlain(text, cache, minIntervalMs, cacheFileHint = '') {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  if (cache[trimmed]) return cache[trimmed]

  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim()
  const libreKey = process.env.LIBRETRANSLATE_API_KEY?.trim() ?? ''
  const libreBase =
    process.env.LIBRETRANSLATE_URL?.trim().replace(/\/$/, '') || 'https://libretranslate.com'
  const libreEndpoint = libreBase.endsWith('/translate') ? libreBase : `${libreBase}/translate`
  const vitaletsOff = process.env.DISABLE_VITALETS_TRANSLATE === '1' || process.env.DISABLE_VITALETS_TRANSLATE === 'true'

  let result = ''
  const tryGoogle = async () => {
    await pace(minIntervalMs)
    result = await translateGoogle(trimmed, googleKey)
    markCallEnd()
  }
  const tryVitalets = async () => {
    await pace(minIntervalMs)
    result = await translateVitaletsSegment(trimmed)
    markCallEnd()
  }
  const tryLibre = async () => {
    await pace(minIntervalMs)
    result = await translateLibre(trimmed, libreEndpoint, libreKey)
    markCallEnd()
  }
  const tryMyMemory = async () => {
    const parts = []
    const chunks = chunkTextForMyMemory(trimmed)
    for (let i = 0; i < chunks.length; i++) {
      await pace(minIntervalMs)
      parts.push(await translateMyMemoryChunk(chunks[i]))
      markCallEnd()
      if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 200))
    }
    result = parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  const run = async () => {
    if (googleKey) {
      try {
        await tryGoogle()
        return
      } catch {
        /* fall through */
      }
    }
    if (!vitaletsOff) {
      try {
        await tryVitalets()
        return
      } catch {
        /* fall through only if retries inside tryVitalets exhausted */
      }
    }
    if (libreKey) {
      try {
        await tryLibre()
        return
      } catch {
        /* fall through */
      }
    }
    if (process.env.USE_MYMEMORY_FALLBACK === '1' || process.env.USE_MYMEMORY_FALLBACK === 'true') {
      try {
        await tryMyMemory()
        return
      } catch (e) {
        const hint = cacheFileHint ? ` Resume with same --cache ${cacheFileHint}` : ''
        throw new Error(
          `${e instanceof Error ? e.message : String(e)} — increase Vitalets retries or set GOOGLE_TRANSLATE_API_KEY / LIBRETRANSLATE_API_KEY.${hint}`,
        )
      }
    }
    const hint = cacheFileHint ? ` Resume later: same command reuses ${cacheFileHint}` : ''
    throw new Error(
      `All translation backends failed (web Google client exhausted retries). Set GOOGLE_TRANSLATE_API_KEY or LIBRETRANSLATE_API_KEY, or run again later. ${hint}`,
    )
  }

  await run()

  cache[trimmed] = result
  return result
}

function setElementTranslatedText(el, translated) {
  while (el.firstChild) el.removeChild(el.firstChild)
  el.appendChild(el.ownerDocument.createTextNode(translated))
}

function parseXhtml(raw) {
  const doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml')
  return doc
}

function patchOpfLanguage(opfXml) {
  let xml = opfXml
  xml = xml.replace(
    /<dc:language([^>]*)>([^<]*)<\/dc:language>/i,
    '<dc:language$1>es</dc:language>',
  )
  if (!/<dc:language/i.test(xml)) {
    xml = xml.replace(
      /(<metadata[^>]*>)/i,
      '$1\n    <dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">es</dc:language>',
    )
  }
  return xml
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.inPath || !args.outPath) {
    console.error(
      'Usage: node scripts/translate-epub-en-es.mjs --in <en.epub> --out <es.epub> [--cache f] [--min-interval-ms n] [--dry-run]',
    )
    process.exit(1)
  }
  if (!args.cachePath) args.cachePath = `${args.outPath}.translation-cache.json`

  const input = readFileSync(args.inPath)
  const zip = await JSZip.loadAsync(input)
  const container = await zip.file('META-INF/container.xml')?.async('string')
  if (!container) throw new Error('No META-INF/container.xml')
  const opfPath = parseContainerForOpf(container)
  if (!opfPath) throw new Error('No OPF path')
  const opfXml = await zip.file(opfPath)?.async('string')
  if (!opfXml) throw new Error('Missing OPF')

  const manifest = parseManifest(opfXml)
  const spine = parseSpineIds(opfXml)

  /** @type {Record<string,string>} */
  const cache = existsSync(args.cachePath) ? JSON.parse(readFileSync(args.cachePath, 'utf8')) : {}

  const stats = { segments: 0, files: 0, fallbackBodies: 0, apiCalls: 0 }
  const uniq = new Set()

  const spineHtmlPaths = []
  for (const idref of spine) {
    const item = manifest.get(idref)
    if (!item) continue
    if (shouldSkipSpineSection(item.href, item.properties)) continue
    const resolved = resolveHref(opfPath, item.href)
    if (!/\.(xhtml|html|htm)$/i.test(resolved)) continue
    spineHtmlPaths.push(resolved)
  }

  if (args.dryRun) {
    for (const path of spineHtmlPaths) {
      const raw = await zip.file(path)?.async('string')
      if (!raw) continue
      const document = parseXhtml(raw)
      const body = document.querySelector('body')
      if (!body) continue
      const candidates = body.querySelectorAll(SELECTOR)
      if (candidates.length === 0) continue
      for (const el of candidates) {
        const plain = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (plain) uniq.add(plain)
      }
    }
    console.log(JSON.stringify({ spineHtmlFiles: spineHtmlPaths.length, uniqueSegments: uniq.size }, null, 2))
    return
  }

  for (const path of spineHtmlPaths) {
    const raw = await zip.file(path)?.async('string')
    if (!raw) continue
    stats.files++
    const document = parseXhtml(raw)
    const body = document.querySelector('body')
    if (!body) continue
    const candidates = body.querySelectorAll(SELECTOR)
    if (candidates.length === 0) continue

    for (const el of candidates) {
      const plain = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!plain) continue
      stats.segments++
      const t = await translatePlain(plain, cache, args.minIntervalMs, args.cachePath)
      setElementTranslatedText(el, t)
      if (stats.segments % 25 === 0) {
        writeFileSync(args.cachePath, JSON.stringify(cache, null, 0), 'utf8')
        console.error(`… ${stats.segments} segments, last file ${path}`)
      }
    }
    const outHtml = document.documentElement?.outerHTML ?? raw
    zip.file(path, outHtml)
  }

  const newOpf = patchOpfLanguage(opfXml)
  zip.file(opfPath, newOpf)

  writeFileSync(args.cachePath, JSON.stringify(cache, null, 0), 'utf8')

  const mt = zip.file('mimetype')
  if (mt) {
    const mtStr = await mt.async('string')
    zip.remove('mimetype')
    zip.file('mimetype', mtStr.trim(), { compression: 'STORE' })
  }

  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/epub+zip',
  })
  writeFileSync(args.outPath, outBuf)
  console.log(
    JSON.stringify(
      {
        out: args.outPath,
        segments: stats.segments,
        files: stats.files,
        cache: args.cachePath,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
