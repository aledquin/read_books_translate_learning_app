/**
 * Skip spine items that are almost always non-reading matter (TOC, index, EPUB nav).
 */

export type SpineSectionLike = {
  href?: string
  properties?: string[]
}

function basenameFromHref(href: string): string {
  const path = href.split('#')[0]?.split('?')[0] ?? ''
  const seg = path.split('/').pop() ?? ''
  return seg.toLowerCase()
}

/** EPUB 3: manifest item properties include `nav` for the navigation document. */
function hasNavProperty(properties: string[] | undefined): boolean {
  if (!properties?.length) return false
  for (const raw of properties) {
    const parts = String(raw).toLowerCase().split(/\s+/)
    if (parts.includes('nav')) return true
  }
  return false
}

/** Filename patterns for TOC / index / contents (common publisher names). */
function isIndexLikeBasename(base: string): boolean {
  if (!base) return false
  return (
    /^(index|toc|contents)\.(xhtml|html|htm|xml)$/i.test(base) ||
    /^table[_-]?of[_-]?contents\.(xhtml|html|htm|xml)$/i.test(base)
  )
}

/**
 * Whether to omit this spine section from extracted reading text.
 */
export function shouldSkipSpineSection(section: SpineSectionLike): boolean {
  if (hasNavProperty(section.properties)) return true
  const base = basenameFromHref(section.href ?? '')
  return isIndexLikeBasename(base)
}
