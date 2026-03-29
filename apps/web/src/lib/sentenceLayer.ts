import type { ContentBlock } from '../types/book'
import { chunkTextForMyMemory, translateEnToEsMyMemory } from './mymemoryTranslate'

export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Replaces word-blended HTML with full-sentence Spanish (plain → MyMemory) from
 * `startParagraphIndex` onward. Failed blocks keep the word-level blend.
 */
export async function applySentenceTranslationLayer(
  blendedHtml: string[],
  blocks: ContentBlock[],
  startParagraphIndex: number,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const out = [...blendedHtml]
  const n = blocks.length
  const total = Math.max(0, n - startParagraphIndex)
  let done = 0

  for (let i = startParagraphIndex; i < n; i++) {
    const plain = blocks[i]?.plain?.trim() ?? ''
    if (!plain) {
      done++
      onProgress?.(done, total)
      continue
    }

    try {
      const chunks = chunkTextForMyMemory(plain)
      const parts: string[] = []
      for (const ch of chunks) {
        parts.push(await translateEnToEsMyMemory(ch))
        await sleep(90)
      }
      const es = parts.join(' ').replace(/\s+/g, ' ').trim()
      out[i] = `<p class="pr-sentence-mt" lang="es">${escapeHtmlText(es)}</p>`
    } catch {
      // keep progressive word blend for this block
    }

    done++
    onProgress?.(done, total)
    await sleep(140)
  }

  return out
}
