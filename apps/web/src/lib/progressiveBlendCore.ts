/**
 * Progressive L2 substitution (compromise + lexicon + schedule).
 * Shared by the Web Worker and Vitest (jsdom).
 * HTML parsing uses linkedom so blending works in workers (no global DOMParser).
 */
import nlp from 'compromise'
import { parseHTML } from 'linkedom'

export type ProgressiveBlendParams = {
  htmlBlocks: string[]
  plainBlocks: string[]
  lexicon: Record<string, string>
  paceGamma: number
  /**
   * Max lemmas from the priority list that may appear as L2 (in order).
   * 0 = unlimited (use every lemma that appears in the book).
   */
  maxLearnWords: number
}

function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw === 'string')
    return raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
  return []
}

function tokenizeLower(s: string): string[] {
  const m = s.match(/\b[a-zA-Z'-]+\b/g)
  return m ? m.map((w) => w.toLowerCase()) : []
}

function bookFreq(blocks: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of blocks) {
    for (const w of tokenizeLower(t)) {
      m.set(w, (m.get(w) ?? 0) + 1)
    }
  }
  return m
}

function posWeight(tags: string[]): number {
  if (tags.includes('Noun')) return 3
  if (tags.includes('Verb')) return 3
  if (tags.includes('Adjective')) return 2
  if (tags.includes('Adverb')) return 1
  return 0.35
}

function lemmaKeyForSurface(surface: string, tags: string[]): string {
  const d = nlp(surface)
  if (tags.includes('Verb') && d.verbs().length > 0) {
    const k = d.verbs().toInfinitive().text().toLowerCase()
    if (k) return k
  }
  if (tags.includes('Noun') && d.nouns().length > 0) {
    const k = d.nouns().toSingular().text().toLowerCase()
    if (k) return k
  }
  if (tags.includes('Adjective') && d.adjectives().length > 0) {
    const k = d.adjectives().json()[0]?.normal
    if (k) return String(k).toLowerCase()
  }
  return surface.toLowerCase()
}

export function resolveLexiconKey(
  surface: string,
  tags: string[],
  lexicon: Record<string, string>,
): string | null {
  const lemma = lemmaKeyForSurface(surface, tags)
  if (lexicon[lemma]) return lemma
  const raw = surface.toLowerCase()
  if (lexicon[raw]) return raw
  return null
}

function matchCase(source: string, translated: string): string {
  if (source.length === 0) return translated
  if (source === source.toUpperCase()) return translated.toUpperCase()
  if (source[0] === source[0].toUpperCase())
    return translated.charAt(0).toUpperCase() + translated.slice(1)
  return translated
}

function collectLemmaScores(
  plainBlocks: string[],
  lexicon: Record<string, string>,
  freq: Map<string, number>,
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const plain of plainBlocks) {
    const doc = nlp(plain)
    for (const term of doc.terms().json()) {
      const tags = normalizeTags(term.tags)
      if (tags.includes('Pronoun') || tags.includes('Determiner')) continue
      const surface = term.text
      const key = resolveLexiconKey(surface, tags, lexicon)
      if (!key) continue
      const surf = surface.toLowerCase()
      const f = freq.get(surf) ?? 1
      const add = posWeight(tags) * Math.log(1 + f)
      scores.set(key, (scores.get(key) ?? 0) + add)
    }
  }
  return scores
}

function orderedLemmas(scores: Map<string, number>): string[] {
  return [...scores.keys()].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
}

/**
 * Last fraction of the book uses the full learnable lemma set so closing sections read
 * mostly in Spanish (every glossary hit in the cap can appear as L2).
 */
const IMMERSION_TAIL_FRACTION = 0.22

function activeCountForParagraph(
  p: number,
  totalParas: number,
  totalLemmas: number,
  paceGamma: number,
): number {
  if (totalParas <= 0 || totalLemmas <= 0) return 0
  const t = (p + 1) / totalParas
  if (t >= 1 - IMMERSION_TAIL_FRACTION) return totalLemmas
  const curved = Math.pow(t, paceGamma)
  return Math.min(totalLemmas, Math.max(0, Math.ceil(totalLemmas * curved)))
}

/** Lexicon keys that appear in one paragraph (same rules as scoring). */
export function lexiconKeysInPlain(
  plain: string,
  lexicon: Record<string, string>,
): Set<string> {
  const keys = new Set<string>()
  const doc = nlp(plain)
  for (const term of doc.terms().json()) {
    const tags = normalizeTags(term.tags)
    if (tags.includes('Pronoun') || tags.includes('Determiner')) continue
    const key = resolveLexiconKey(term.text, tags, lexicon)
    if (key) keys.add(key)
  }
  return keys
}

/**
 * Lemmas that may be shown in Spanish in this paragraph: intersection of
 * curriculum (ordered slice) with words actually present, widening the slice
 * until at least one local hit exists so early chapters are not stuck on English.
 */
function activeSetForParagraph(
  p: number,
  P: number,
  L: number,
  ordered: string[],
  plain: string,
  lexicon: Record<string, string>,
  paceGamma: number,
): Set<string> {
  if (L === 0) return new Set()
  const inPara = lexiconKeysInPlain(plain, lexicon)
  let m = activeCountForParagraph(p, P, L, paceGamma)
  const top = (n: number) => new Set(ordered.slice(0, n).filter((k) => inPara.has(k)))

  let active = top(m)
  while (active.size === 0 && inPara.size > 0 && m < L) {
    m += 1
    active = top(m)
  }
  return active
}

function replaceTokensInTextNode(
  textNode: Text,
  doc: Document,
  active: ReadonlySet<string>,
  lexicon: Record<string, string>,
  firstSeenLemma: Set<string>,
): void {
  const parent = textNode.parentNode
  if (!parent) return
  const text = textNode.data
  const frag = doc.createDocumentFragment()
  let lastIndex = 0
  const re = /\b([a-zA-Z'-]+)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const fullWord = m[0]
    const start = m.index
    if (start > lastIndex) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex, start)))
    }
    const d = nlp(fullWord)
    const tags = normalizeTags(d.json()[0]?.terms?.[0]?.tags)
    const key = resolveLexiconKey(fullWord, tags, lexicon)
    if (key && active.has(key) && lexicon[key]) {
      const es = lexicon[key]!
      const display = matchCase(fullWord, es)
      const isFirst = !firstSeenLemma.has(key)
      if (isFirst) firstSeenLemma.add(key)
      const span = doc.createElement('span')
      span.setAttribute('lang', 'es')
      span.textContent = display
      if (isFirst) span.className = 'pr-first-l2'
      frag.appendChild(span)
    } else {
      frag.appendChild(doc.createTextNode(fullWord))
    }
    lastIndex = start + fullWord.length
  }
  if (lastIndex < text.length) {
    frag.appendChild(doc.createTextNode(text.slice(lastIndex)))
  }
  parent.replaceChild(frag, textNode)
}

function collectTextNodes(node: Node, out: Text[]): void {
  const kids = node.childNodes
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]!
    if (child.nodeType === 3) {
      out.push(child as Text)
    } else {
      collectTextNodes(child, out)
    }
  }
}

export function blendHtmlBlock(
  html: string,
  active: ReadonlySet<string>,
  lexicon: Record<string, string>,
  firstSeenLemma: Set<string>,
): string {
  const wrapped = `<div data-pr-root="1">${html}</div>`
  const { document: doc } = parseHTML(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${wrapped}</body></html>`,
  )
  const root = doc.querySelector('[data-pr-root="1"]')
  if (!root) return html

  const textNodes: Text[] = []
  collectTextNodes(root, textNodes)

  for (const tn of textNodes) {
    replaceTokensInTextNode(tn, doc, active, lexicon, firstSeenLemma)
  }

  return root.innerHTML
}

/** How many distinct lexicon lemmas appear in the book (used for diagnostics/tests). */
function applyLearnCap(ordered: string[], maxLearnWords: number): string[] {
  if (maxLearnWords <= 0 || ordered.length <= maxLearnWords) return ordered
  return ordered.slice(0, maxLearnWords)
}

export function countScheduledLemmas(
  plainBlocks: string[],
  lexicon: Record<string, string>,
  maxLearnWords = 0,
): number {
  const freq = bookFreq(plainBlocks)
  const scores = collectLemmaScores(plainBlocks, lexicon, freq)
  const ordered = applyLearnCap(orderedLemmas(scores), maxLearnWords)
  return ordered.length
}

/** Ordered English lemmas that appear in the book and have a gloss (blend priority order). */
export type ReplacementEntry = { en: string; es: string; rank: number }

export function getReplacementWordList(
  plainBlocks: string[],
  lexicon: Record<string, string>,
  maxLearnWords = 0,
): ReplacementEntry[] {
  const freq = bookFreq(plainBlocks)
  const scores = collectLemmaScores(plainBlocks, lexicon, freq)
  const ordered = applyLearnCap(orderedLemmas(scores), maxLearnWords)
  return ordered.map((en, i) => ({
    en,
    es: lexicon[en] ?? '',
    rank: i + 1,
  }))
}

/**
 * Run progressive blending over aligned HTML / plain blocks.
 */
export function blendProgressiveHtml(
  params: ProgressiveBlendParams,
  onProgress?: (current: number, total: number) => void,
): string[] {
  const { htmlBlocks, plainBlocks, lexicon, paceGamma, maxLearnWords } = params
  const P = plainBlocks.length
  const freq = bookFreq(plainBlocks)
  const scores = collectLemmaScores(plainBlocks, lexicon, freq)
  const ordered = applyLearnCap(orderedLemmas(scores), maxLearnWords)
  const L = ordered.length

  const activeSets: Set<string>[] = []
  for (let p = 0; p < P; p++) {
    activeSets.push(
      activeSetForParagraph(p, P, L, ordered, plainBlocks[p] ?? '', lexicon, paceGamma),
    )
  }

  const firstSeenLemma = new Set<string>()
  const out: string[] = []
  for (let p = 0; p < P; p++) {
    out.push(blendHtmlBlock(htmlBlocks[p] ?? '', activeSets[p]!, lexicon, firstSeenLemma))
    onProgress?.(p + 1, P)
  }
  return out
}
