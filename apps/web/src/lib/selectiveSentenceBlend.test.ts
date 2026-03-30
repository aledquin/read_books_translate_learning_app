import { describe, expect, it } from 'vitest'
import { computeSentenceReplaceMask, maskHasAnyTrue } from './selectiveSentenceBlend'

describe('computeSentenceReplaceMask', () => {
  it('does not replace sentences with no lexicon lemmas', () => {
    const lex = { time: 'tiempo', walk: 'caminar' }
    const blocks = ['Hello there. No glossary words here.']
    const mask = computeSentenceReplaceMask(blocks, lex, 3)
    expect(mask).toHaveLength(1)
    expect(mask[0]).toEqual([false, false])
    expect(maskHasAnyTrue(mask)).toBe(false)
  })

  it('replaces only from the sentence where a lemma reaches the threshold (per lemma)', () => {
    const lex = { time: 'tiempo' }
    const blocks = ['time. time. time.']
    const mask = computeSentenceReplaceMask(blocks, lex, 3)
    expect(mask[0]).toEqual([false, false, true])
    expect(maskHasAnyTrue(mask)).toBe(true)
  })

  it('tracks lemmas across paragraphs', () => {
    const lex = { time: 'tiempo' }
    const blocks = ['time. time.', 'time again.']
    const mask = computeSentenceReplaceMask(blocks, lex, 3)
    expect(mask[0]).toEqual([false, false])
    expect(mask[1]).toEqual([true])
  })
})
