import ePub from 'epubjs'
import type { ContentBlock } from '../types/book'
import { shouldSkipSpineSection } from './epubSkipSections'
import { sanitizeChapterHtml } from './sanitize'

export async function extractEpub(arrayBuffer: ArrayBuffer): Promise<{
  title: string
  blocks: ContentBlock[]
}> {
  const book = ePub(arrayBuffer)
  // epubjs: `ready` is a Promise, not a method (do not call `ready()`).
  await book.ready
  const rawTitle = book.packaging?.metadata?.title
  const first = Array.isArray(rawTitle) ? rawTitle[0] : rawTitle
  const title =
    typeof first === 'string' && first.trim() ? first.trim() : 'Untitled'

  const blocks: ContentBlock[] = []
  let globalIndex = 0
  let chapterSeq = 0
  const spine = book.spine
  const load = book.load.bind(book)

  for (let i = 0; i < spine.length; i++) {
    const item = spine.get(i)
    if (!item) continue

    if (shouldSkipSpineSection(item)) continue

    await item.load(load)
    const doc = item.document
    if (!doc?.body) continue

    const chapterIndex = chapterSeq++
    const chapterTitle =
      (item as { label?: string }).label?.trim() || `Section ${chapterIndex + 1}`

    const candidates = doc.body.querySelectorAll(
      'p, h1, h2, h3, h4, blockquote, li',
    )

    const pushBlock = (html: string, plain: string, blockIndex: number) => {
      const clean = sanitizeChapterHtml(html)
      const p = plain.replace(/\s+/g, ' ').trim()
      if (!p) return
      blocks.push({
        chapterIndex,
        chapterTitle,
        blockIndex,
        globalIndex: globalIndex++,
        html: clean,
        plain: p,
      })
    }

    if (candidates.length === 0) {
      const html = doc.body.innerHTML
      const plain = doc.body.textContent ?? ''
      pushBlock(`<section>${html}</section>`, plain, 0)
      continue
    }

    candidates.forEach((el, j) => {
      const html = el.outerHTML
      const plain = el.textContent ?? ''
      pushBlock(html, plain, j)
    })
  }

  return { title, blocks }
}

