import type { ContentBlock, ReaderSettings } from '../types/book'
import {
  firstSeenLemmaSchedule,
  startParagraphIndexAfterNthFirstSeen,
} from './progressiveBlendCore'
import { runProgressiveBlend } from './processBook'
import { applySentenceTranslationLayer } from './sentenceLayer'

export type BlendPhase = 'blend' | 'sentence'

/**
 * Word-level progressive blend, then optional EN→ES sentence translation (MyMemory) for
 * paragraphs after the Nth first-seen lemma. Only when `sentenceTranslateEnabled` and `en-es`.
 */
export async function buildBlendedHtmlPipeline(
  blocks: ContentBlock[],
  lexicon: Record<string, string>,
  ui: ReaderSettings,
  onProgress: (phase: BlendPhase, current: number, total: number) => void,
): Promise<string[]> {
  const htmlBlocks = blocks.map((b) => b.html)
  const plainBlocks = blocks.map((b) => b.plain)

  const blended = await runProgressiveBlend(
    htmlBlocks,
    plainBlocks,
    lexicon,
    ui.paceGamma,
    ui.learnWordCap,
    (c, t) => onProgress('blend', c, t),
  )

  if (!ui.sentenceTranslateEnabled || ui.pairId !== 'en-es') {
    return blended
  }

  const n = Math.max(1, Math.min(5000, ui.sentenceTranslateAfterLemma))
  const events = firstSeenLemmaSchedule(plainBlocks, lexicon, ui.paceGamma, ui.learnWordCap)
  const start = startParagraphIndexAfterNthFirstSeen(events, n)
  if (!Number.isFinite(start) || start >= blocks.length) {
    return blended
  }

  return applySentenceTranslationLayer(blended, blocks, start, (c, t) =>
    onProgress('sentence', c, t),
  )
}
