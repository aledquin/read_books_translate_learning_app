import type { ContentBlock, ReaderSettings } from '../types/book'
import { startParagraphIndexAfterSightings } from './progressiveBlendCore'
import { runProgressiveBlend } from './processBook'
import {
  buildSelectiveSentenceBlend,
  computeSentenceReplaceMask,
  maskHasAnyTrue,
  useSelectiveSentenceSightingsBlend,
} from './selectiveSentenceBlend'
import { applySentenceTranslationLayer } from './sentenceLayer'

export type BlendPhase = 'blend' | 'sentence'

export type BuildBlendedPipelineOptions = {
  /** Called at most once when the free MyMemory tier refuses translation (quota / 429). */
  onMyMemoryQuotaLimited?: (message: string) => void
}

/** True if this block includes full-sentence Spanish (whole paragraph or per-sentence segments). */
export function blendedBlockHasSentenceMt(html: string): boolean {
  return html.includes('pr-sentence-mt') || html.includes('pr-sentence-seg')
}

/**
 * When sentence mode is on but no paragraph used full-sentence translation, explain why
 * (settings off is handled by the caller).
 */
export function sentenceTranslationIssueMessage(
  ui: ReaderSettings,
  plainBlocks: string[],
  lexicon: Record<string, string>,
  blended: string[],
): string | null {
  if (!ui.sentenceTranslateEnabled || ui.pairId !== 'en-es') return null
  if (ui.sentenceTranslateStyle === 'tap_to_reveal') return null
  if (blended.some((h) => blendedBlockHasSentenceMt(h))) return null
  const threshold = Math.max(1, Math.min(5000, ui.sentenceTranslateAfterSightings))

  if (
    ui.sentenceTranslateStyle === 'replace_sentence' &&
    ui.sentenceTranslateWhen === 'after_lexicon_sightings'
  ) {
    const mask = computeSentenceReplaceMask(plainBlocks, lexicon, threshold)
    if (!maskHasAnyTrue(mask)) {
      return `No sentences qualify for full Spanish: each lexicon word must appear at least ${threshold} times in the book (in order) before a sentence that contains it is replaced. Sentences with no lexicon words stay progressively blended. Lower the lexicon sightings count in Settings or use more repeated vocabulary.`
    }
    return 'Full-sentence translation is on, but no Spanish segments were added. Common causes: MyMemory quota (HTTP 429), an ad blocker, or offline. Re-import with a paired Spanish EPUB (same sentence boundaries as English) to avoid APIs, or add Google Cloud in .env. Open DevTools → Console for errors.'
  }

  const start =
    ui.sentenceTranslateWhen === 'from_beginning'
      ? 0
      : startParagraphIndexAfterSightings(plainBlocks, lexicon, threshold)
  if (!Number.isFinite(start) || start >= plainBlocks.length) {
    return `Full-sentence translation never starts in this book: fewer than ${threshold} lexicon word matches occurred in order (or the threshold is only reached in the last paragraph). Lower “Start sentences after” in Settings.`
  }
  return 'Full-sentence translation is on, but no paragraphs were translated. Common causes: MyMemory quota (HTTP 429), an ad blocker, or offline. Re-import and select two EPUBs at once (English first, Spanish second, same paragraph order) to use bundled Spanish instead of APIs. Or use Google Cloud in .env, tap mode, raise VITE_MYMEMORY_MIN_INTERVAL_MS, or VITE_MYMEMORY_USE_DEV_PROXY in dev. Open DevTools → Console for “[sentence translation]” errors.'
}

/**
 * Word-level progressive blend, then optional EN→ES sentence translation. Replace paragraph (and
 * replace sentence from the beginning) use the cumulative lexicon hit index. Replace sentence +
 * after lexicon sightings uses a dedicated pass: per lexicon word, after N occurrences a sentence
 * containing that word may switch to full Spanish; other sentences stay mixed.
 * `tap_to_reveal` skips bulk replacement; the reader loads Spanish on demand.
 * Only when `sentenceTranslateEnabled` and `en-es`.
 */
export async function buildBlendedHtmlPipeline(
  blocks: ContentBlock[],
  lexicon: Record<string, string>,
  ui: ReaderSettings,
  onProgress: (phase: BlendPhase, current: number, total: number) => void,
  options?: BuildBlendedPipelineOptions,
): Promise<string[]> {
  const htmlBlocks = blocks.map((b) => b.html)
  const plainBlocks = blocks.map((b) => b.plain)

  if (!ui.sentenceTranslateEnabled || ui.pairId !== 'en-es') {
    return runProgressiveBlend(
      htmlBlocks,
      plainBlocks,
      lexicon,
      ui.paceGamma,
      ui.learnWordCap,
      (c, t) => onProgress('blend', c, t),
    )
  }

  if (ui.sentenceTranslateStyle === 'tap_to_reveal') {
    return runProgressiveBlend(
      htmlBlocks,
      plainBlocks,
      lexicon,
      ui.paceGamma,
      ui.learnWordCap,
      (c, t) => onProgress('blend', c, t),
    )
  }

  if (useSelectiveSentenceSightingsBlend(ui)) {
    return buildSelectiveSentenceBlend(blocks, lexicon, ui, onProgress, options)
  }

  const blended = await runProgressiveBlend(
    htmlBlocks,
    plainBlocks,
    lexicon,
    ui.paceGamma,
    ui.learnWordCap,
    (c, t) => onProgress('blend', c, t),
  )

  const threshold = Math.max(1, Math.min(5000, ui.sentenceTranslateAfterSightings))
  const start =
    ui.sentenceTranslateWhen === 'from_beginning'
      ? 0
      : startParagraphIndexAfterSightings(plainBlocks, lexicon, threshold)
  if (!Number.isFinite(start) || start >= blocks.length) {
    return blended
  }

  return applySentenceTranslationLayer(
    blended,
    blocks,
    start,
    (c, t) => onProgress('sentence', c, t),
    options?.onMyMemoryQuotaLimited,
    ui.sentenceTranslateStyle === 'replace_sentence',
  )
}
