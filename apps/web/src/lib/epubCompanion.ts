import type { ContentBlock } from '../types/book'

/** True if the filename suggests a Spanish edition (used to fix multi-select order). */
export function looksLikeSpanishEpubFilename(name: string): boolean {
  const lower = name.toLowerCase()
  if (!lower.endsWith('.epub')) return false
  return (
    /\.es\.epub$/.test(lower) ||
    /[-_]es\.epub$/.test(lower) ||
    /\.esp\.epub$/.test(lower) ||
    /spanish/.test(lower) ||
    /-es-/.test(lower)
  )
}

/**
 * When two EPUBs are chosen, ensure the English one is first. Browsers often sort by name, so
 * `reader-feature-sample.es.epub` can end up before `reader-feature-sample.epub`.
 */
export function orderEpubFilesEnglishFirst(files: File[]): File[] {
  if (files.length !== 2) return files
  const [a, b] = files
  const aEs = looksLikeSpanishEpubFilename(a.name)
  const bEs = looksLikeSpanishEpubFilename(b.name)
  if (aEs && !bEs) return [b, a]
  if (bEs && !aEs) return [a, b]
  return files
}

/**
 * Pair English blocks with a Spanish EPUB extracted the same way (`extractEpub`).
 * Paragraphs are matched **by order** (spine → chapter → p/h/li/…); editions must align.
 */
export function attachSpanishCompanionBlocks(
  enBlocks: ContentBlock[],
  esBlocks: ContentBlock[],
): {
  blocks: ContentBlock[]
  mismatchWarning?: string
  linkedParagraphCount: number
} {
  const n = Math.min(enBlocks.length, esBlocks.length)
  let mismatchWarning: string | undefined
  if (enBlocks.length !== esBlocks.length) {
    mismatchWarning = `Spanish EPUB has ${esBlocks.length} text blocks vs ${enBlocks.length} in English. Only the first ${n} pairs are used; the rest fall back to online translation if enabled.`
  }

  let linkedParagraphCount = 0
  const blocks = enBlocks.map((b, i) => {
    if (i >= n) return b
    const pe = esBlocks[i]!.plain.replace(/\s+/g, ' ').trim()
    if (!pe) return b
    linkedParagraphCount++
    return { ...b, plainEs: pe }
  })

  return { blocks, mismatchWarning, linkedParagraphCount }
}

export function bookHasBundledSentenceEs(blocks: ContentBlock[]): boolean {
  return blocks.some((b) => Boolean(b.plainEs?.trim()))
}
