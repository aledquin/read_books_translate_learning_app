/**
 * End-to-end translation display (no APIs): `reader-feature-sample.blocks.json` + bundled lexicon.
 * `runProgressiveBlend` is mocked to use sync `blendProgressiveHtml` so Vitest does not require Workers.
 * Regenerate blocks: `npm run epub:feature-sample` (apps/web).
 */
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { blendProgressiveHtml } from './progressiveBlendCore'
import {
  analyzeBlendedHtml,
  FIXTURE_FIRST_SPANISH_PHRASE,
  loadBundledEnEsLexicon,
  loadReaderFeatureSampleWithCompanion,
  NON_API_PIPELINE_SCENARIOS,
  readerFeatureSampleBlocksJsonPath,
  readerFeatureSampleEnPath,
  stripBundledSpanish,
  type BlendedAnalysis,
} from './translationPipelineHarness'

vi.mock('./processBook', () => ({
  runProgressiveBlend: (
    htmlBlocks: string[],
    plainBlocks: string[],
    lexicon: Record<string, string>,
    paceGamma: number,
    maxLearnWords: number,
    onProgress: (c: number, t: number) => void,
  ) =>
    Promise.resolve(
      blendProgressiveHtml(
        { htmlBlocks, plainBlocks, lexicon, paceGamma, maxLearnWords },
        onProgress,
      ),
    ),
}))

import { buildBlendedHtmlPipeline } from './buildBlendedOutput'

function expectAnalysis(
  id: string,
  a: BlendedAnalysis,
  check: (a: BlendedAnalysis) => void,
): void {
  try {
    check(a)
  } catch (e) {
    throw new Error(`Scenario "${id}": ${e instanceof Error ? e.message : String(e)}`)
  }
}

describe('translation pipeline (fixtures, no APIs)', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('[reader-import]')) return
    })
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('requires built reader-feature-sample EPUBs and blocks JSON at repo fixtures/epub', () => {
    expect(existsSync(readerFeatureSampleEnPath())).toBe(true)
    expect(existsSync(readerFeatureSampleBlocksJsonPath())).toBe(true)
  })

  it('runs all non-API scenarios and produces a stable report snapshot', async () => {
    const lex = loadBundledEnEsLexicon()
    expect(Object.keys(lex).length).toBeGreaterThan(10)

    const { blocks, title } = loadReaderFeatureSampleWithCompanion()
    expect(title).toContain('Reader Feature')
    const linked = blocks.filter((b) => b.plainEs?.trim())
    expect(linked.length).toBe(blocks.length)

    const report: {
      book: { title: string; blocks: number; withPlainEs: number }
      lexiconKeys: number
      scenarios: Array<{
        id: string
        description: string
        analysis: BlendedAnalysis
        checks: string[]
      }>
    } = {
      book: {
        title,
        blocks: blocks.length,
        withPlainEs: linked.length,
      },
      lexiconKeys: Object.keys(lex).length,
      scenarios: [],
    }

    for (const scenario of NON_API_PIPELINE_SCENARIOS) {
      const blended = await buildBlendedHtmlPipeline(
        blocks,
        lex,
        scenario.ui,
        () => {},
      )
      const analysis = analyzeBlendedHtml(blended)
      const checks: string[] = []

      switch (scenario.id) {
        case 'progressive_only':
          expectAnalysis(scenario.id, analysis, (x) => {
            expect(x.hasLangEs).toBe(true)
            expect(x.blocksWithPrSentenceMt).toBe(0)
            expect(x.blocksWithPrSentenceSeg).toBe(0)
            expect(x.langEsSpanCount).toBeGreaterThan(5)
          })
          checks.push('Inline lang=es only; no pr-sentence-mt/seg')
          expect(blended[0]?.length).toBeGreaterThan(40)
          expect(blended[0]).toMatch(/meet|morning|walk|tiempo|día|noche/i)
          checks.push('First block still readable (English and/or inline Spanish)')
          break
        case 'tap_to_reveal':
          expectAnalysis(scenario.id, analysis, (x) => {
            expect(x.hasLangEs).toBe(true)
            expect(x.blocksWithPrSentenceMt).toBe(0)
            expect(x.blocksWithPrSentenceSeg).toBe(0)
          })
          checks.push('Same bulk output as progressive (tap loads later in UI)')
          break
        case 'replace_paragraph_from_beginning_bundled':
          expectAnalysis(scenario.id, analysis, (x) => {
            expect(x.blocksWithPrSentenceMt).toBe(blocks.length)
            expect(x.blocksWithPrSentenceSeg).toBe(0)
          })
          checks.push('Every block pr-sentence-mt (bundled)')
          expect(blended.join('\n').includes(FIXTURE_FIRST_SPANISH_PHRASE)).toBe(true)
          checks.push('Known bundled Spanish phrase present')
          break
        case 'replace_sentence_from_beginning_bundled':
          expectAnalysis(scenario.id, analysis, (x) => {
            expect(x.blocksWithPrSentenceSeg).toBeGreaterThan(0)
            expect(x.blocksWithPrSentenceMt).toBeGreaterThan(0)
          })
          checks.push('By-sentence segments + mt wrapper class on paragraphs')
          expect(blended.join('\n').includes(FIXTURE_FIRST_SPANISH_PHRASE)).toBe(true)
          checks.push('Bundled first paragraph Spanish present')
          break
        case 'replace_sentence_after_sightings_bundled':
          expectAnalysis(scenario.id, analysis, (x) => {
            expect(x.hasLangEs).toBe(true)
            expect(x.blocksWithPrSentenceSeg).toBeGreaterThan(0)
            expect(x.blocksWithPrFirstL2).toBeGreaterThan(0)
          })
          checks.push('Mix: some pr-sentence-seg, some progressive first-L2')
          {
            const joined = blended.join('\n')
            expect(joined).toContain('pr-sentence-seg')
            expect(joined).toMatch(/[áéíóúñ¿¡]/i)
          }
          checks.push('Bundled Spanish appears inside sentence segments (not necessarily first line)')
          break
        case 'replace_paragraph_after_sightings_bundled':
          expectAnalysis(scenario.id, analysis, (x) => {
            expect(x.blocksWithPrSentenceMt).toBeGreaterThan(0)
            expect(x.hasLangEs).toBe(true)
          })
          checks.push('Bundled blocks use full paragraph Spanish')
          expect(blended.join('\n').includes(FIXTURE_FIRST_SPANISH_PHRASE)).toBe(true)
          checks.push('Early bundled block includes known Spanish')
          break
        default:
          throw new Error(`Unhandled scenario ${scenario.id}`)
      }

      report.scenarios.push({
        id: scenario.id,
        description: scenario.description,
        analysis,
        checks,
      })
    }

    expect(report).toMatchSnapshot()
  })

  it('English-only blocks: no plainEs → replace modes would need APIs; progressive-only stays inline L2', async () => {
    const lex = loadBundledEnEsLexicon()
    const { blocks: withEs } = loadReaderFeatureSampleWithCompanion()
    const blocks = stripBundledSpanish(withEs)
    expect(blocks.some((b) => b.plainEs?.trim())).toBe(false)

    const ui = NON_API_PIPELINE_SCENARIOS.find((s) => s.id === 'progressive_only')!.ui
    const blended = await buildBlendedHtmlPipeline(blocks, lex, ui, () => {})
    const a = analyzeBlendedHtml(blended)
    expect(a.blocksWithPrSentenceMt).toBe(0)
    expect(a.hasLangEs).toBe(true)
    expect(a.langEsSpanCount).toBeGreaterThan(3)
  })
})
