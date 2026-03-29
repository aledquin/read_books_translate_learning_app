// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  blendProgressiveHtml,
  blendHtmlBlock,
  countScheduledLemmas,
  resolveLexiconKey,
} from './progressiveBlendCore'

const miniLex: Record<string, string> = {
  time: 'tiempo',
  life: 'vida',
  night: 'noche',
  day: 'día',
}

describe('resolveLexiconKey', () => {
  it('maps surface to lexicon entry', () => {
    expect(resolveLexiconKey('time', ['Noun'], miniLex)).toBe('time')
    expect(resolveLexiconKey('Time', ['Noun'], miniLex)).toBe('time')
  })
})

describe('countScheduledLemmas', () => {
  it('counts lemmas from plain text that exist in lexicon', () => {
    const n = countScheduledLemmas(
      ['time life night day in one line for counting'],
      miniLex,
    )
    expect(n).toBe(4)
  })

  it('is zero when lexicon has no overlap', () => {
    expect(countScheduledLemmas(['The quick brown fox.'], miniLex)).toBe(0)
  })
})

describe('blendProgressiveHtml', () => {
  it('inserts Spanish spans with lang="es" when lemmas are active', () => {
    // One paragraph so every scheduled lemma is active (t = 1).
    const htmlBlocks = ['<p>time and life together.</p>']
    const plainBlocks = ['time and life together.']
    const out = blendProgressiveHtml({
      htmlBlocks,
      plainBlocks,
      lexicon: miniLex,
      paceGamma: 1,
    })
    expect(out).toHaveLength(1)
    const html = out[0]!
    expect(html).toMatch(/lang="es"/)
    expect(html).toContain('tiempo')
    expect(html).toContain('vida')
    expect(html).toMatch(/pr-first-l2/)
  })

  it('marks only the first occurrence of a lemma with pr-first-l2', () => {
    const htmlBlocks = ['<p>Time flies. Time stops.</p>']
    const plainBlocks = ['Time flies. Time stops.']
    const out = blendProgressiveHtml({
      htmlBlocks,
      plainBlocks,
      lexicon: { time: 'tiempo' },
      paceGamma: 1,
    })
    const html = out[0]!
    const firstL2 = (html.match(/class="pr-first-l2"/g) ?? []).length
    expect(firstL2).toBe(1)
    expect((html.match(/lang="es"/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).toMatch(/tiempo/i)
  })

  it('does not emit lang="es" when lexicon is empty', () => {
    const out = blendProgressiveHtml({
      htmlBlocks: ['<p>The time of my life.</p>'],
      plainBlocks: ['The time of my life.'],
      lexicon: {},
      paceGamma: 1,
    })
    expect(out[0]).not.toMatch(/lang="es"/)
  })

  it('still translates across many blocks (schedule adds lemmas over the book)', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({
      html: `<p>Block ${i}: time and life and night.</p>`,
      plain: `Block ${i}: time and life and night.`,
    }))
    // Lower gamma = steeper early ramp so more lemmas become active sooner.
    const out = blendProgressiveHtml({
      htmlBlocks: blocks.map((b) => b.html),
      plainBlocks: blocks.map((b) => b.plain),
      lexicon: miniLex,
      paceGamma: 0.45,
    })
    const joined = out.join('\n')
    expect(joined).toMatch(/lang="es"/)
    expect(joined).toMatch(/tiempo/i)
    expect(joined).toMatch(/vida/i)
    // Third lemma ("night") may stay English until late in the schedule with few blocks.
  })
})

describe('blendHtmlBlock', () => {
  it('replaces inside simple HTML', () => {
    const active = new Set<string>(['time', 'life'])
    const first = new Set<string>()
    const html = blendHtmlBlock(
      '<p>time and life</p>',
      active,
      miniLex,
      first,
    )
    expect(html).toContain('tiempo')
    expect(html).toContain('vida')
  })
})
