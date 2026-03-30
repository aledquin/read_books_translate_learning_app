/**
 * Shared helpers for integration tests and documentation: fixture EPUBs, lexicon load, blend stats.
 * No translation APIs — bundled `plainEs` only for sentence modes in tests.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ContentBlock, ReaderSettings } from '../types/book'
import { defaultSettings } from '../types/book'
import { attachSpanishCompanionBlocks } from './epubCompanion'
import { extractEpub } from './epubExtract'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Repo root: apps/web/src/lib → ../../../../ */
export function repoRootFromLib(): string {
  return join(__dirname, '..', '..', '..', '..')
}

export function readerFeatureSampleEnPath(): string {
  return join(repoRootFromLib(), 'fixtures', 'epub', 'reader-feature-sample.epub')
}

export function readerFeatureSampleEsPath(): string {
  return join(repoRootFromLib(), 'fixtures', 'epub', 'reader-feature-sample.es.epub')
}

export function bundledLexiconPath(): string {
  return join(__dirname, '..', '..', 'public', 'lexicons', 'en-es.json')
}

export function loadBundledEnEsLexicon(): Record<string, string> {
  const raw = readFileSync(bundledLexiconPath(), 'utf8')
  return JSON.parse(raw) as Record<string, string>
}

/** First Spanish paragraph in the fixture (known stable string for assertions). */
export const FIXTURE_FIRST_SPANISH_PHRASE = 'El tiempo y el día se encuentran en esta línea'

/** English opening (progressive mix still contains English surface). */
export const FIXTURE_FIRST_ENGLISH_SURFACE = 'Time and day'

export async function loadReaderFeatureSampleWithCompanion(): Promise<{
  blocks: ContentBlock[]
  title: string
}> {
  const enBuf = readFileSync(readerFeatureSampleEnPath())
  const esBuf = readFileSync(readerFeatureSampleEsPath())
  const en = await extractEpub(enBuf.buffer.slice(enBuf.byteOffset, enBuf.byteOffset + enBuf.byteLength))
  const es = await extractEpub(esBuf.buffer.slice(esBuf.byteOffset, esBuf.byteOffset + esBuf.byteLength))
  const { blocks } = attachSpanishCompanionBlocks(en.blocks, es.blocks)
  return { blocks, title: en.title }
}

export type BlendedAnalysis = {
  blockCount: number
  joinedLength: number
  hasLangEs: boolean
  blocksWithPrSentenceMt: number
  blocksWithPrSentenceSeg: number
  blocksWithPrFirstL2: number
  /** Rough count of inline L2 spans (word-level). */
  langEsSpanCount: number
}

export function analyzeBlendedHtml(blended: string[]): BlendedAnalysis {
  const joined = blended.join('\n')
  const langEsSpanCount = (joined.match(/lang="es"/g) ?? []).length
  return {
    blockCount: blended.length,
    joinedLength: joined.length,
    hasLangEs: joined.includes('lang="es"'),
    blocksWithPrSentenceMt: blended.filter((h) => h.includes('pr-sentence-mt')).length,
    blocksWithPrSentenceSeg: blended.filter((h) => h.includes('pr-sentence-seg')).length,
    blocksWithPrFirstL2: blended.filter((h) => h.includes('pr-first-l2')).length,
    langEsSpanCount,
  }
}

export function baseUi(over: Partial<ReaderSettings> = {}): ReaderSettings {
  return { ...defaultSettings, pairId: 'en-es', ...over }
}

export type PipelineScenario = {
  id: string
  description: string
  ui: ReaderSettings
}

export const NON_API_PIPELINE_SCENARIOS: PipelineScenario[] = [
  {
    id: 'progressive_only',
    description:
      'Sentence translation off: worker progressive blend only; lexicon words become inline Spanish (lang=es) with schedule.',
    ui: baseUi({ sentenceTranslateEnabled: false }),
  },
  {
    id: 'tap_to_reveal',
    description:
      'Sentence on + tap to reveal: same bulk HTML as progressive; Spanish paragraphs load on tap in the reader (not in this pipeline).',
    ui: baseUi({
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'tap_to_reveal',
    }),
  },
  {
    id: 'replace_paragraph_from_beginning_bundled',
    description:
      'Replace whole paragraph from the start: every block with plainEs becomes one pr-sentence-mt paragraph of bundled Spanish (no API).',
    ui: baseUi({
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'replace_paragraph',
      sentenceTranslateWhen: 'from_beginning',
    }),
  },
  {
    id: 'replace_sentence_from_beginning_bundled',
    description:
      'Replace by sentence from the start: bundled EN/ES with matching sentence counts → pr-sentence-seg spans; no API.',
    ui: baseUi({
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'replace_sentence',
      sentenceTranslateWhen: 'from_beginning',
    }),
  },
  {
    id: 'replace_sentence_after_sightings_bundled',
    description:
      'Replace by sentence after lexicon sightings (per-lemma threshold): selective blend — only qualifying sentences use bundled Spanish; others stay word-mixed.',
    ui: baseUi({
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'replace_sentence',
      sentenceTranslateWhen: 'after_lexicon_sightings',
      sentenceTranslateAfterSightings: 3,
    }),
  },
  {
    id: 'replace_paragraph_after_sightings_bundled',
    description:
      'Replace paragraph after cumulative lexicon hits: blocks with plainEs still get bundled Spanish before the threshold; others wait until the global hit index.',
    ui: baseUi({
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'replace_paragraph',
      sentenceTranslateWhen: 'after_lexicon_sightings',
      sentenceTranslateAfterSightings: 5,
    }),
  },
]
