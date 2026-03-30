import type { ContentBlock } from '../types/book'
import { logReaderImport } from './readerImportLog'
import { splitParagraphIntoSentences } from './sentenceSplit'
import {
  isMyMemoryQuotaExceededError,
  translatePlainEnglishParagraph,
} from './mymemoryTranslate'

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

function wrapFullParagraphSpanish(es: string): string {
  return `<p class="pr-sentence-mt" lang="es">${escapeHtmlText(es)}</p>`
}

/**
 * When English and Spanish plain texts split into the same number of segments, wrap each Spanish
 * segment in a span (one translated sentence per span). Otherwise returns null (caller falls back
 * to one paragraph of Spanish).
 */
export function buildAlignedSentenceSpansHtml(enPlain: string, esPlain: string): string | null {
  const enSents = splitParagraphIntoSentences(enPlain)
  const esSents = splitParagraphIntoSentences(esPlain)
  if (enSents.length === 0 || enSents.length !== esSents.length) return null
  const inner = esSents
    .map((seg) => `<span class="pr-sentence-seg">${escapeHtmlText(seg)}</span>`)
    .join(' ')
  return `<p class="pr-sentence-mt pr-sentence-mt--by-sentence" lang="es">${inner}</p>`
}

type ReplacementResult = { html: string; outerSleepMs: number; apiCalls: number }

/**
 * Whether this block gets the sentence-replace layer. Bundled `plainEs` is always applied (no API);
 * blocks without it wait until `blockIndex >= startParagraphIndex` (lexicon threshold).
 */
export function blockQualifiesForSentenceReplace(
  block: ContentBlock,
  blockIndex: number,
  startParagraphIndex: number,
): boolean {
  const plain = block.plain?.trim() ?? ''
  if (!plain) return false
  const hasBundled = Boolean(block.plainEs?.trim())
  return hasBundled || blockIndex >= startParagraphIndex
}

/**
 * Build Spanish HTML for one block. `replaceBySentence` splits EN (and bundled ES) into sentences;
 * API path translates each sentence separately when there are multiple.
 */
async function buildSpanishReplacementHtml(
  block: ContentBlock,
  replaceBySentence: boolean,
): Promise<ReplacementResult> {
  const plain = block.plain.trim()
  const bundled = block.plainEs?.trim() ?? ''

  if (!replaceBySentence) {
    const es = bundled
      ? bundled
      : await translatePlainEnglishParagraph(plain, { interChunkDelayMs: 0 })
    return {
      html: wrapFullParagraphSpanish(es),
      outerSleepMs: bundled ? 0 : 120,
      apiCalls: bundled ? 0 : 1,
    }
  }

  if (bundled) {
    const aligned = buildAlignedSentenceSpansHtml(plain, bundled)
    if (aligned) {
      return { html: aligned, outerSleepMs: 0, apiCalls: 0 }
    }
    logReaderImport(
      '[sentenceLayer] bundled block: EN/ES sentence counts differ — using whole Spanish paragraph',
      { plainPreview: plain.slice(0, 80) },
    )
    return { html: wrapFullParagraphSpanish(bundled), outerSleepMs: 0, apiCalls: 0 }
  }

  const enSents = splitParagraphIntoSentences(plain)
  if (enSents.length <= 1) {
    const es = await translatePlainEnglishParagraph(plain, { interChunkDelayMs: 0 })
    return { html: wrapFullParagraphSpanish(es), outerSleepMs: 120, apiCalls: 1 }
  }

  const parts: string[] = []
  for (const s of enSents) {
    const t = await translatePlainEnglishParagraph(s, { interChunkDelayMs: 0 })
    parts.push(`<span class="pr-sentence-seg">${escapeHtmlText(t)}</span>`)
    await sleep(120)
  }
  return {
    html: `<p class="pr-sentence-mt pr-sentence-mt--by-sentence" lang="es">${parts.join(' ')}</p>`,
    outerSleepMs: 0,
    apiCalls: enSents.length,
  }
}

/**
 * Replaces word-blended HTML with full-sentence Spanish where each block qualifies.
 * Blocks with bundled `plainEs` always qualify (paired EPUB). Other blocks qualify from
 * `startParagraphIndex` onward (lexicon threshold delays API translation only).
 */
export async function applySentenceTranslationLayer(
  blendedHtml: string[],
  blocks: ContentBlock[],
  startParagraphIndex: number,
  onProgress?: (current: number, total: number) => void,
  onMyMemoryQuotaLimited?: (message: string) => void,
  replaceBySentence = false,
): Promise<string[]> {
  const out = [...blendedHtml]
  const n = blocks.length
  let quotaNotified = false

  let total = 0
  for (let i = 0; i < n; i++) {
    if (blockQualifiesForSentenceReplace(blocks[i]!, i, startParagraphIndex)) total++
  }

  let bundledEarly = 0
  for (let i = 0; i < startParagraphIndex && i < n; i++) {
    if (blocks[i]?.plainEs?.trim()) bundledEarly++
  }
  logReaderImport('[sentenceLayer] starting full-sentence pass', {
    lexiconThresholdBlockIndex: startParagraphIndex,
    blocksToProcess: total,
    bundledBlocksBeforeThreshold: bundledEarly,
    replaceBySentence,
    note: 'Bundled plainEs is applied even before the lexicon threshold; threshold only gates API calls.',
  })

  let usedBundledBlocks = 0
  let apiCallsTotal = 0
  let done = 0

  for (let i = 0; i < n; i++) {
    if (!blockQualifiesForSentenceReplace(blocks[i]!, i, startParagraphIndex)) continue

    try {
      const { html, outerSleepMs, apiCalls } = await buildSpanishReplacementHtml(
        blocks[i]!,
        replaceBySentence,
      )
      out[i] = html
      apiCallsTotal += apiCalls
      if (blocks[i]?.plainEs?.trim()) usedBundledBlocks++
      if (outerSleepMs > 0) await sleep(outerSleepMs)
    } catch (e) {
      logReaderImport('[sentenceLayer] block failed (keeping word-blend)', {
        blockIndex: i,
        error: e instanceof Error ? e.message : String(e),
      })
      if (!quotaNotified && isMyMemoryQuotaExceededError(e)) {
        quotaNotified = true
        onMyMemoryQuotaLimited?.(e.message)
      }
    }

    done++
    onProgress?.(done, Math.max(1, total))
  }

  logReaderImport('[sentenceLayer] finished', {
    blocksUsedBundledEs: usedBundledBlocks,
    translationApiCalls: apiCallsTotal,
    replaceBySentence,
  })

  return out
}
