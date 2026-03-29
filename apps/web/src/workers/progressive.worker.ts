/// <reference lib="webworker" />

import nlp from 'compromise'

export type ProcessMessage = {
  type: 'process'
  id: number
  htmlBlocks: string[]
  plainBlocks: string[]
  lexicon: Record<string, string>
  paceGamma: number
}

type OutMsg =
  | { type: 'progress'; id: number; current: number; total: number }
  | { type: 'result'; id: number; blendedHtml: string[] }
  | { type: 'error'; id: number; message: string }


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
      const key = lemmaKeyForSurface(surface, tags)
      if (!lexicon[key]) continue
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

function activeCountForParagraph(
  p: number,
  totalParas: number,
  totalLemmas: number,
  paceGamma: number,
): number {
  if (totalParas <= 0 || totalLemmas <= 0) return 0
  const t = (p + 1) / totalParas
  const curved = Math.pow(t, paceGamma)
  return Math.min(totalLemmas, Math.max(0, Math.ceil(totalLemmas * curved)))
}

function blendHtmlBlock(
  html: string,
  active: ReadonlySet<string>,
  lexicon: Record<string, string>,
): string {
  const wrapped = `<div data-pr-root="1">${html}</div>`
  const dom = new DOMParser().parseFromString(wrapped, 'text/html')
  const root = dom.querySelector('[data-pr-root="1"]')
  if (!root) return html

  const walker = dom.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node: Node | null = walker.nextNode()
  while (node) {
    textNodes.push(node as Text)
    node = walker.nextNode()
  }

  for (const tn of textNodes) {
    const orig = tn.data
    const next = orig.replace(/\b([a-zA-Z'-]+)\b/g, (full) => {
      const d = nlp(full)
      const tags = normalizeTags(d.json()[0]?.terms?.[0]?.tags)
      const key = lemmaKeyForSurface(full, tags)
      if (!active.has(key)) return full
      const es = lexicon[key]
      if (!es) return full
      return matchCase(full, es)
    })
    tn.data = next
  }

  return root.innerHTML
}

function runProcess(msg: ProcessMessage): string[] {
  const { htmlBlocks, plainBlocks, lexicon, paceGamma } = msg
  const P = plainBlocks.length
  const freq = bookFreq(plainBlocks)
  const scores = collectLemmaScores(plainBlocks, lexicon, freq)
  const ordered = orderedLemmas(scores)
  const L = ordered.length

  const activeSets: Set<string>[] = []
  for (let p = 0; p < P; p++) {
    const k = activeCountForParagraph(p, P, L, paceGamma)
    activeSets.push(new Set(ordered.slice(0, k)))
  }

  const out: string[] = []
  for (let p = 0; p < P; p++) {
    out.push(blendHtmlBlock(htmlBlocks[p] ?? '', activeSets[p]!, lexicon))
    const post: OutMsg = { type: 'progress', id: msg.id, current: p + 1, total: P }
    self.postMessage(post)
  }
  return out
}

self.onmessage = (ev: MessageEvent<ProcessMessage>) => {
  const msg = ev.data
  if (msg.type !== 'process') return
  try {
    const blendedHtml = runProcess(msg)
    const res: OutMsg = { type: 'result', id: msg.id, blendedHtml }
    self.postMessage(res)
  } catch (e) {
    const err: OutMsg = {
      type: 'error',
      id: msg.id,
      message: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(err)
  }
}
