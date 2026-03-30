/**
 * For replace_sentence + after_lexicon_sightings: per sentence, replace with full Spanish only if the
 * sentence contains at least one lexicon lemma whose document-order occurrence count has reached the
 * threshold; other sentences stay progressive word-blend. Runs on the main thread (single pass).
 */
import nlp from 'compromise'
import { parseHTML } from 'linkedom'
import type { ContentBlock, ReaderSettings } from '../types/book'
import { logReaderImport } from './readerImportLog'
import {
  activeSetForParagraph,
  applyLearnCap,
  blendHtmlBlock,
  bookFreq,
  collectLemmaScores,
  normalizeTags,
  orderedLemmas,
  resolveLexiconKey,
} from './progressiveBlendCore'
import {
  isMyMemoryQuotaExceededError,
  translatePlainEnglishParagraph,
} from './mymemoryTranslate'
import { escapeHtmlText } from './sentenceLayer'
import { splitParagraphIntoSentences } from './sentenceSplit'

const TOKEN_RE = /\b([a-zA-Z'-]+)\b/g

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Per block, per sentence: true iff the sentence contains at least one lexicon hit (same
 * token/lemma rules as progressive blend) and, after counting that sentence, some lexicon key
 * that appears in this sentence has cumulative count >= threshold.
 */
export function computeSentenceReplaceMask(
  plainBlocks: string[],
  lexicon: Record<string, string>,
  threshold: number,
): boolean[][] {
  const lemmaOcc = new Map<string, number>()
  const mask: boolean[][] = []

  for (let p = 0; p < plainBlocks.length; p++) {
    const sents = splitParagraphIntoSentences(plainBlocks[p] ?? '')
    const row: boolean[] = []
    for (const sent of sents) {
      const keysHitThisSentence = new Set<string>()
      TOKEN_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = TOKEN_RE.exec(sent)) !== null) {
        const d = nlp(m[0]!)
        const tags = normalizeTags(d.json()[0]?.terms?.[0]?.tags)
        const key = resolveLexiconKey(m[0]!, tags, lexicon)
        if (key && lexicon[key]) {
          keysHitThisSentence.add(key)
          lemmaOcc.set(key, (lemmaOcc.get(key) ?? 0) + 1)
        }
      }
      let q = false
      if (keysHitThisSentence.size > 0) {
        for (const k of keysHitThisSentence) {
          if ((lemmaOcc.get(k) ?? 0) >= threshold) {
            q = true
            break
          }
        }
      }
      row.push(q)
    }
    mask.push(row)
  }
  return mask
}

export function maskHasAnyTrue(mask: boolean[][]): boolean {
  return mask.some((row) => row.some(Boolean))
}

/** Mark lemmas as already shown as L2 so later progressive snippets match a full-block blend. */
function markFirstSeenForActiveLemmasInPlain(
  plain: string,
  active: ReadonlySet<string>,
  lexicon: Record<string, string>,
  firstSeenLemma: Set<string>,
): void {
  const doc = nlp(plain)
  for (const term of doc.terms().json()) {
    const tags = normalizeTags(term.tags)
    const key = resolveLexiconKey(term.text, tags, lexicon)
    if (key && active.has(key) && lexicon[key]) firstSeenLemma.add(key)
  }
}

function blendSentenceToInnerHtml(
  sentencePlain: string,
  active: ReadonlySet<string>,
  lexicon: Record<string, string>,
  firstSeenLemma: Set<string>,
): string {
  const uid = `w${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const safe = escapeHtmlText(sentencePlain)
  const wrapped = `<span data-pr-swrap="${uid}">${safe}</span>`
  const blended = blendHtmlBlock(wrapped, active, lexicon, firstSeenLemma)
  const { document } = parseHTML(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="x">${blended}</div></body></html>`,
  )
  const span = document.querySelector(`[data-pr-swrap="${uid}"]`)
  return span?.innerHTML ?? safe
}

function mergeClasses(existing: string, add: string): string {
  const set = new Set(
    `${existing} ${add}`
      .split(/\s+/u)
      .map((s) => s.trim())
      .filter(Boolean),
  )
  return [...set].join(' ')
}

function applyInnerToBlockHtml(
  originalHtml: string,
  newInner: string,
  extraClasses: string,
): string {
  const wrapped = `<div data-pr-root="1">${originalHtml}</div>`
  const { document } = parseHTML(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${wrapped}</body></html>`,
  )
  const root = document.querySelector('[data-pr-root="1"]')
  if (!root) return `<p class="${extraClasses}">${newInner}</p>`
  const el = root.firstElementChild
  if (el) {
    const cls = mergeClasses(el.getAttribute('class') ?? '', extraClasses)
    if (cls) el.setAttribute('class', cls)
    el.innerHTML = newInner
    return root.innerHTML
  }
  return `<p class="${extraClasses}">${newInner}</p>`
}

export type SelectiveBlendPhase = 'blend' | 'sentence'

export type SelectiveBlendOptions = {
  onMyMemoryQuotaLimited?: (message: string) => void
}

/**
 * Progressive blend with optional full-Spanish sentences only where the per-lemma sighting rule
 * matches. Requires replace_sentence + after_lexicon_sightings (caller should enforce).
 */
export async function buildSelectiveSentenceBlend(
  blocks: ContentBlock[],
  lexicon: Record<string, string>,
  ui: ReaderSettings,
  onProgress: (phase: SelectiveBlendPhase, current: number, total: number) => void,
  options?: SelectiveBlendOptions,
): Promise<string[]> {
  const plainBlocks = blocks.map((b) => b.plain)
  const htmlBlocks = blocks.map((b) => b.html)
  const P = plainBlocks.length
  const threshold = Math.max(1, Math.min(5000, ui.sentenceTranslateAfterSightings))

  const freq = bookFreq(plainBlocks)
  const scores = collectLemmaScores(plainBlocks, lexicon, freq)
  const ordered = applyLearnCap(orderedLemmas(scores), ui.learnWordCap)
  const L = ordered.length

  const activeSets: Set<string>[] = []
  for (let p = 0; p < P; p++) {
    activeSets.push(
      activeSetForParagraph(p, P, L, ordered, plainBlocks[p] ?? '', lexicon, ui.paceGamma),
    )
  }

  const mask = computeSentenceReplaceMask(plainBlocks, lexicon, threshold)
  logReaderImport('[selectiveSentenceBlend] mask computed', {
    threshold,
    sentencesMarkedForReplace: mask.reduce((n, row) => n + row.filter(Boolean).length, 0),
  })

  const firstSeenLemma = new Set<string>()
  const out: string[] = []
  let quotaNotified = false
  let apiCalls = 0

  let sentenceDone = 0
  let sentenceTotal = 0
  for (let p = 0; p < P; p++) {
    sentenceTotal += splitParagraphIntoSentences(plainBlocks[p] ?? '').length
  }
  sentenceTotal = Math.max(1, sentenceTotal)

  for (let p = 0; p < P; p++) {
    onProgress('blend', p + 1, P)
    const plain = plainBlocks[p] ?? ''
    const sents = splitParagraphIntoSentences(plain)
    const row = mask[p] ?? []
    const active = activeSets[p]!

    if (sents.length === 0) {
      out.push(blendHtmlBlock(htmlBlocks[p] ?? '', active, lexicon, firstSeenLemma))
      continue
    }

    const bundled = blocks[p]?.plainEs?.trim() ?? ''
    const esSents = bundled ? splitParagraphIntoSentences(bundled) : null
    const alignedBundled =
      bundled && esSents && esSents.length === sents.length && esSents.length > 0

    const parts: string[] = []

    for (let si = 0; si < sents.length; si++) {
      sentenceDone++
      onProgress('sentence', sentenceDone, sentenceTotal)

      const sent = sents[si]!
      const replace = row[si] ?? false

      if (!replace) {
        parts.push(blendSentenceToInnerHtml(sent, active, lexicon, firstSeenLemma))
        continue
      }

      try {
        if (alignedBundled) {
          parts.push(
            `<span class="pr-sentence-seg" lang="es">${escapeHtmlText(esSents![si]!)}</span>`,
          )
        } else if (bundled && !alignedBundled) {
          const es = await translatePlainEnglishParagraph(sent, { interChunkDelayMs: 0 })
          apiCalls++
          parts.push(`<span class="pr-sentence-seg" lang="es">${escapeHtmlText(es)}</span>`)
          await sleep(120)
        } else {
          const es = await translatePlainEnglishParagraph(sent, { interChunkDelayMs: 0 })
          apiCalls++
          parts.push(`<span class="pr-sentence-seg" lang="es">${escapeHtmlText(es)}</span>`)
          await sleep(120)
        }
        markFirstSeenForActiveLemmasInPlain(sent, active, lexicon, firstSeenLemma)
      } catch (e) {
        logReaderImport('[selectiveSentenceBlend] sentence translate failed (progressive fallback)', {
          blockIndex: p,
          sentenceIndex: si,
          error: e instanceof Error ? e.message : String(e),
        })
        if (!quotaNotified && isMyMemoryQuotaExceededError(e)) {
          quotaNotified = true
          options?.onMyMemoryQuotaLimited?.(e instanceof Error ? e.message : String(e))
        }
        parts.push(blendSentenceToInnerHtml(sent, active, lexicon, firstSeenLemma))
      }
    }

    const anySpanishSeg = parts.some((h) => h.includes('pr-sentence-seg'))
    const extraClass = anySpanishSeg ? 'pr-sentence-mt pr-sentence-mt--by-sentence' : ''
    const inner = parts.join(' ')
    out.push(applyInnerToBlockHtml(htmlBlocks[p] ?? '', inner, extraClass))
  }

  logReaderImport('[selectiveSentenceBlend] done', { translationApiCalls: apiCalls })
  return out
}

export function useSelectiveSentenceSightingsBlend(ui: ReaderSettings): boolean {
  return (
    ui.sentenceTranslateEnabled &&
    ui.pairId === 'en-es' &&
    ui.sentenceTranslateStyle === 'replace_sentence' &&
    ui.sentenceTranslateWhen === 'after_lexicon_sightings'
  )
}
