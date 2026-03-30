/**
 * Count reading blocks from raw EPUB bytes without epubjs (Vitest / alignment checks).
 * Mirrors `extractEpub` selectors and skip rules closely enough for EN↔ES companion checks.
 */
import JSZip from 'jszip'
import { parseHTML } from 'linkedom'
import { shouldSkipSpineSection } from './epubSkipSections'

const SELECTOR = 'p, h1, h2, h3, h4, blockquote, li'

function dirnameZip(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '' : path.slice(0, i)
}

function resolveHref(opfPath: string, href: string): string {
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

function parseContainerForOpf(containerXml: string): string | null {
  const m = containerXml.match(/full-path\s*=\s*"([^"]+)"/i)
  return m?.[1]?.trim() ?? null
}

type ManifestEntry = { href: string; properties: string }

function parseManifest(opf: string): Map<string, ManifestEntry> {
  const map = new Map<string, ManifestEntry>()
  const itemRe = /<item\b([^>]*?)(?:\/>|>)/gis
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(opf)) !== null) {
    const chunk = m[1] ?? ''
    const idM = /\bid\s*=\s*"([^"]+)"/i.exec(chunk)
    const hrefM = /\bhref\s*=\s*"([^"]+)"/i.exec(chunk)
    if (!idM?.[1] || !hrefM?.[1]) continue
    const propM = /\bproperties\s*=\s*"([^"]*)"/i.exec(chunk)
    map.set(idM[1], {
      href: hrefM[1],
      properties: propM?.[1] ?? '',
    })
  }
  return map
}

function parseSpineIds(opf: string): string[] {
  const ids: string[] = []
  const re = /<itemref\b[^>]*\bidref\s*=\s*"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(opf)) !== null) {
    ids.push(m[1]!)
  }
  return ids
}

/**
 * Non-empty reading blocks (same element types as `extractEpub`), after skip rules.
 * Accepts `Buffer` (Node) or `ArrayBuffer` for JSZip.
 */
export async function countEpubReadingBlocks(
  data: ArrayBuffer | Buffer,
): Promise<{
  total: number
  opfPath: string | null
}> {
  const zip = await JSZip.loadAsync(data as Parameters<typeof JSZip.loadAsync>[0])
  const container = await zip.file('META-INF/container.xml')?.async('string')
  if (!container) return { total: 0, opfPath: null }
  const opfPath = parseContainerForOpf(container)
  if (!opfPath) return { total: 0, opfPath: null }
  const opfXml = await zip.file(opfPath)?.async('string')
  if (!opfXml) return { total: 0, opfPath }
  const manifest = parseManifest(opfXml)
  const spine = parseSpineIds(opfXml)
  let total = 0
  for (const idref of spine) {
    const item = manifest.get(idref)
    if (!item) continue
    if (
      shouldSkipSpineSection({
        href: item.href,
        properties: item.properties ? item.properties.split(/\s+/) : undefined,
      })
    ) {
      continue
    }
    const resolved = resolveHref(opfPath, item.href)
    if (!/\.(xhtml|html|htm)$/i.test(resolved)) continue
    const raw = await zip.file(resolved)?.async('string')
    if (!raw) continue
    const { document } = parseHTML(raw)
    const body = document.body
    if (!body) continue
    const candidates = body.querySelectorAll(SELECTOR)
    candidates.forEach((el) => {
      const plain = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (plain) total++
    })
  }
  return { total, opfPath }
}
