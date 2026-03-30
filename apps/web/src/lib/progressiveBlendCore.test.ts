import { describe, expect, it, vi } from 'vitest'
import {
  activeCountForParagraph,
  activeSetForParagraph,
  applyLearnCap,
  articleEnToEsSurface,
  blendHtmlBlock,
  blendProgressiveHtml,
  bookFreq,
  countScheduledLemmas,
  firstSeenLemmaSchedule,
  getReplacementWordList,
  lexiconKeysInPlain,
  matchCase,
  normalizeTags,
  orderedLemmas,
  resolveLexiconKey,
  startParagraphIndexAfterNthFirstSeen,
  startParagraphIndexAfterSightings,
  tokenizeLower,
} from './progressiveBlendCore'

const miniLex: Record<string, string> = {
  time: 'tiempo',
  life: 'vida',
  night: 'noche',
  day: 'día',
}

describe('normalizeTags', () => {
  it('returns array tags as-is', () => {
    expect(normalizeTags(['Noun', 'Singular'])).toEqual(['Noun', 'Singular'])
  })

  it('splits pipe-separated string tags', () => {
    expect(normalizeTags('Noun|Singular')).toEqual(['Noun', 'Singular'])
  })

  it('trims and drops empty segments from string', () => {
    expect(normalizeTags(' Noun |  | Verb ')).toEqual(['Noun', 'Verb'])
  })

  it('returns empty array for unsupported types (null, number, object)', () => {
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags(42)).toEqual([])
    expect(normalizeTags({})).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(normalizeTags('')).toEqual([])
  })
})

describe('tokenizeLower', () => {
  it('lowercases ASCII words', () => {
    expect(tokenizeLower('Time and LIFE')).toEqual(['time', 'and', 'life'])
  })

  it('includes apostrophe and hyphen word chars', () => {
    expect(tokenizeLower("don't well-known")).toEqual(["don't", 'well-known'])
  })

  it('returns empty array when no word tokens', () => {
    expect(tokenizeLower('')).toEqual([])
    expect(tokenizeLower('   ')).toEqual([])
    expect(tokenizeLower('123 @#$')).toEqual([])
  })

  it('treats accented letters as non-word chars (splits tokens around them)', () => {
    expect(tokenizeLower('café niño')).toEqual(['caf', 'ni', 'o'])
  })
})

describe('bookFreq', () => {
  it('aggregates counts across blocks', () => {
    const m = bookFreq(['time time', 'time life'])
    expect(m.get('time')).toBe(3)
    expect(m.get('life')).toBe(1)
  })

  it('returns empty map for empty input', () => {
    expect(bookFreq([]).size).toBe(0)
    expect(bookFreq(['', '   ']).size).toBe(0)
  })
})

describe('matchCase', () => {
  it('returns gloss when source is empty', () => {
    expect(matchCase('', 'hola')).toBe('hola')
  })

  it('uppercases gloss when source is all caps', () => {
    expect(matchCase('TIME', 'tiempo')).toBe('TIEMPO')
  })

  it('title-cases gloss when source starts with capital', () => {
    expect(matchCase('Time', 'tiempo')).toBe('Tiempo')
  })

  it('leaves gloss lower when source is lower', () => {
    expect(matchCase('time', 'tiempo')).toBe('tiempo')
  })
})

describe('orderedLemmas', () => {
  it('sorts by descending score', () => {
    const scores = new Map([
      ['a', 1],
      ['b', 9],
      ['c', 3],
    ])
    expect(orderedLemmas(scores)).toEqual(['b', 'c', 'a'])
  })

  it('handles empty map', () => {
    expect(orderedLemmas(new Map())).toEqual([])
  })

  it('stable tie-break is by sort order of keys (implementation detail)', () => {
    const scores = new Map([
      ['m', 1],
      ['z', 1],
      ['a', 1],
    ])
    const out = orderedLemmas(scores)
    expect(out).toHaveLength(3)
    expect(new Set(out)).toEqual(new Set(['a', 'm', 'z']))
  })
})

describe('applyLearnCap', () => {
  it('returns full list when maxLearnWords is 0', () => {
    const o = ['a', 'b', 'c']
    expect(applyLearnCap(o, 0)).toEqual(o)
  })

  it('returns full list when maxLearnWords is negative', () => {
    const o = ['a', 'b']
    expect(applyLearnCap(o, -1)).toEqual(o)
  })

  it('slices when cap is smaller than length', () => {
    expect(applyLearnCap(['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
  })

  it('returns unchanged when cap >= length', () => {
    const o = ['a', 'b']
    expect(applyLearnCap(o, 10)).toEqual(o)
  })
})

describe('activeCountForParagraph', () => {
  it('returns 0 when totalParas or totalLemmas is 0', () => {
    expect(activeCountForParagraph(0, 0, 10, 1)).toBe(0)
    expect(activeCountForParagraph(0, 5, 0, 1)).toBe(0)
    expect(activeCountForParagraph(0, -1, 10, 1)).toBe(0)
  })

  it('uses full lemma count in immersion tail', () => {
    const P = 50
    const L = 100
    const pTail = Math.ceil(P * (1 - 0.22)) - 1
    expect(activeCountForParagraph(pTail, P, L, 2)).toBe(L)
  })

  it('uses power curve before tail', () => {
    expect(activeCountForParagraph(0, 100, 100, 1)).toBe(1)
    expect(activeCountForParagraph(49, 100, 100, 1)).toBe(50)
  })

  it('single-paragraph book is entirely in tail (full L)', () => {
    expect(activeCountForParagraph(0, 1, 40, 2)).toBe(40)
  })
})

describe('activeSetForParagraph', () => {
  const ordered = ['time', 'life', 'night']

  it('returns empty set when L is 0', () => {
    expect(
      activeSetForParagraph(0, 5, 0, ordered, 'time flies', miniLex, 1).size,
    ).toBe(0)
  })

  it('widens until at least one in-paragraph lemma is active', () => {
    const plain = 'only life here'
    const s = activeSetForParagraph(0, 20, 3, ordered, plain, miniLex, 3)
    expect(s.has('life')).toBe(true)
    expect(s.size).toBeGreaterThanOrEqual(1)
  })

  it('returns empty when paragraph has no lexicon hits', () => {
    const s = activeSetForParagraph(0, 10, 3, ordered, 'hello world', miniLex, 1)
    expect(s.size).toBe(0)
  })
})

describe('lexiconKeysInPlain', () => {
  it('collects keys for words in lexicon', () => {
    const s = lexiconKeysInPlain('time and life', miniLex)
    expect(s.has('time')).toBe(true)
    expect(s.has('life')).toBe(true)
  })

  it('returns empty set for empty string', () => {
    expect(lexiconKeysInPlain('', miniLex).size).toBe(0)
  })

  it('returns empty when lexicon is empty', () => {
    expect(lexiconKeysInPlain('time flies', {}).size).toBe(0)
  })
})

describe('firstSeenLemmaSchedule', () => {
  it('orders first-seen lemmas in document order', () => {
    const plain = ['time and life together.']
    const ev = firstSeenLemmaSchedule(plain, miniLex, 1, 0)
    const lemmas = ev.map((e) => e.lemma)
    expect(lemmas).toContain('time')
    expect(lemmas).toContain('life')
    expect(lemmas.indexOf('time')).toBeLessThan(lemmas.indexOf('life'))
  })

  it('returns empty when lexicon does not overlap', () => {
    expect(firstSeenLemmaSchedule(['hello'], miniLex, 1, 0)).toEqual([])
  })
})

describe('startParagraphIndexAfterNthFirstSeen', () => {
  it('uses last event when N is larger than schedule length (small lexicon)', () => {
    expect(startParagraphIndexAfterNthFirstSeen([{ paragraphIndex: 0, lemma: 'a' }], 99)).toBe(1)
  })

  it('returns paragraph after the one containing the Nth event when N fits', () => {
    const ev = [
      { paragraphIndex: 0, lemma: 'a' },
      { paragraphIndex: 1, lemma: 'b' },
    ]
    expect(startParagraphIndexAfterNthFirstSeen(ev, 2)).toBe(2)
  })

  it('returns Infinity for N <= 0 or no events', () => {
    expect(startParagraphIndexAfterNthFirstSeen([], 1)).toBe(Number.POSITIVE_INFINITY)
    expect(
      startParagraphIndexAfterNthFirstSeen([{ paragraphIndex: 0, lemma: 'x' }], 0),
    ).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('startParagraphIndexAfterSightings', () => {
  it('returns paragraph index after the block where the Nth lexicon hit occurs', () => {
    const blocks = ['hello world', 'time and life', 'day breaks']
    expect(startParagraphIndexAfterSightings(blocks, miniLex, 1)).toBe(2)
    expect(startParagraphIndexAfterSightings(blocks, miniLex, 2)).toBe(2)
    expect(startParagraphIndexAfterSightings(blocks, miniLex, 3)).toBe(3)
  })

  it('counts repeat appearances of the same lexicon word', () => {
    const blocks = ['time time time', 'night']
    expect(startParagraphIndexAfterSightings(blocks, miniLex, 3)).toBe(1)
  })

  it('returns Infinity when threshold is not reached', () => {
    expect(startParagraphIndexAfterSightings(['no match'], miniLex, 1)).toBe(
      Number.POSITIVE_INFINITY,
    )
    expect(startParagraphIndexAfterSightings(['time'], miniLex, 5)).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('returns Infinity for threshold <= 0', () => {
    expect(startParagraphIndexAfterSightings(['time'], miniLex, 0)).toBe(
      Number.POSITIVE_INFINITY,
    )
  })
})

describe('resolveLexiconKey', () => {
  it('maps surface to lexicon entry', () => {
    expect(resolveLexiconKey('time', ['Noun'], miniLex)).toBe('time')
    expect(resolveLexiconKey('Time', ['Noun'], miniLex)).toBe('time')
  })

  it('returns null when lemma not in lexicon', () => {
    expect(resolveLexiconKey('unknown', ['Noun'], miniLex)).toBe(null)
    expect(resolveLexiconKey('xyz', [], miniLex)).toBe(null)
  })

  it('returns null for empty lexicon', () => {
    expect(resolveLexiconKey('time', ['Noun'], {})).toBe(null)
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

  it('is zero for empty blocks', () => {
    expect(countScheduledLemmas([], miniLex)).toBe(0)
  })

  it('respects positive learn cap', () => {
    expect(
      countScheduledLemmas(['time life night day'], miniLex, 2),
    ).toBe(2)
  })
})

describe('getReplacementWordList', () => {
  it('returns en→es entries for lemmas in the book in score order', () => {
    const rows = getReplacementWordList(['time time life', 'night day'], miniLex, 0)
    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((r) => r.en))).toEqual(
      new Set(['time', 'life', 'night', 'day']),
    )
    expect(rows[0]?.en).toBe('time')
    expect(rows[0]).toMatchObject({ es: 'tiempo', rank: 1 })
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('respects maxLearnWords cap', () => {
    const rows = getReplacementWordList(['time time life', 'night day'], miniLex, 2)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.en).toBe('time')
  })

  it('returns empty for empty blocks', () => {
    expect(getReplacementWordList([], miniLex, 0)).toEqual([])
  })

  it('assigns rank starting at 1', () => {
    const rows = getReplacementWordList(['cat'], { cat: 'gato' }, 0)
    expect(rows[0]?.rank).toBe(1)
  })
})

describe('blendHtmlBlock', () => {
  it('replaces inside simple HTML', () => {
    const active = new Set<string>(['time', 'life'])
    const first = new Set<string>()
    const html = blendHtmlBlock('<p>time and life</p>', active, miniLex, first)
    expect(html).toContain('tiempo')
    expect(html).toContain('vida')
  })

  it('returns empty inner html for empty fragment input', () => {
    expect(blendHtmlBlock('', new Set(), miniLex, new Set())).toBe('')
  })

  it('does not replace when active set excludes lemma', () => {
    const html = blendHtmlBlock(
      '<p>time only</p>',
      new Set<string>(),
      miniLex,
      new Set(),
    )
    expect(html).not.toContain('tiempo')
    expect(html).toContain('time')
  })

  it('walks nested text nodes', () => {
    const html = blendHtmlBlock(
      '<p>a <span>time</span> b</p>',
      new Set(['time']),
      miniLex,
      new Set(),
    )
    expect(html).toContain('tiempo')
  })

  it('leaves unknown words unchanged', () => {
    const html = blendHtmlBlock(
      '<p>time xyz</p>',
      new Set(['time', 'xyz']),
      { time: 'tiempo' },
      new Set(),
    )
    expect(html).toContain('tiempo')
    expect(html).toContain('xyz')
  })
})

describe('articleEnToEsSurface', () => {
  it('maps the and a/an to el/un', () => {
    expect(articleEnToEsSurface('The')).toBe('el')
    expect(articleEnToEsSurface('a')).toBe('un')
    expect(articleEnToEsSurface('An')).toBe('un')
  })
})

describe('blendProgressiveHtml', () => {
  it('translates a trailing article before an active lexicon noun (blendHtmlBlock)', () => {
    const html = blendHtmlBlock(
      '<p>See the time.</p>',
      new Set(['time']),
      { time: 'tiempo' },
      new Set(),
    )
    expect(html).toContain('pr-l2-article')
    expect(html).toContain('data-pr-gloss-en="the"')
    expect(html).toContain('el')
    expect(html).toContain('tiempo')
  })

  it('inserts Spanish spans with lang="es" when lemmas are active', () => {
    const htmlBlocks = ['<p>time and life together.</p>']
    const plainBlocks = ['time and life together.']
    const out = blendProgressiveHtml({
      htmlBlocks,
      plainBlocks,
      lexicon: miniLex,
      paceGamma: 1,
      maxLearnWords: 0,
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
      maxLearnWords: 0,
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
      maxLearnWords: 0,
    })
    expect(out[0]).not.toMatch(/lang="es"/)
  })

  it('returns empty array when there are no blocks', () => {
    const out = blendProgressiveHtml({
      htmlBlocks: [],
      plainBlocks: [],
      lexicon: miniLex,
      paceGamma: 1,
      maxLearnWords: 0,
    })
    expect(out).toEqual([])
  })

  it('produces no L2 when html block is empty (no text nodes) even if plain has words', () => {
    const out = blendProgressiveHtml({
      htmlBlocks: [''],
      plainBlocks: ['time.'],
      lexicon: { time: 'tiempo' },
      paceGamma: 1,
      maxLearnWords: 0,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toBe('')
    expect(out[0]).not.toMatch(/lang="es"/)
  })

  it('only emits one output per plain block (extra html entries unused)', () => {
    const out = blendProgressiveHtml({
      htmlBlocks: ['<p>time and life</p>', '<p>ignored</p>'],
      plainBlocks: ['time and life together.'],
      lexicon: miniLex,
      paceGamma: 1,
      maxLearnWords: 0,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/tiempo/)
  })

  it('calls onProgress for each block', () => {
    const fn = vi.fn()
    blendProgressiveHtml(
      {
        htmlBlocks: ['<p>a</p>', '<p>b</p>'],
        plainBlocks: ['a.', 'b.'],
        lexicon: {},
        paceGamma: 1,
        maxLearnWords: 0,
      },
      fn,
    )
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(2, 2)
  })

  it('still translates across many blocks (schedule adds lemmas over the book)', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({
      html: `<p>Block ${i}: time and life and night.</p>`,
      plain: `Block ${i}: time and life and night.`,
    }))
    const out = blendProgressiveHtml({
      htmlBlocks: blocks.map((b) => b.html),
      plainBlocks: blocks.map((b) => b.plain),
      lexicon: miniLex,
      paceGamma: 0.45,
      maxLearnWords: 0,
    })
    const joined = out.join('\n')
    expect(joined).toMatch(/lang="es"/)
    expect(joined).toMatch(/tiempo/i)
    expect(joined).toMatch(/vida/i)
  })

  it('fills in Spanish for all learnable lemmas in the immersion tail (late book)', () => {
    const phrase = 'time and life and night together.'
    const P = 40
    const htmlBlocks = Array.from({ length: P }, () => `<p>${phrase}</p>`)
    const plainBlocks = Array.from({ length: P }, () => phrase)
    const out = blendProgressiveHtml({
      htmlBlocks,
      plainBlocks,
      lexicon: miniLex,
      paceGamma: 2.2,
      maxLearnWords: 0,
    })
    const esCount = (h: string) => (h.match(/lang="es"/g) ?? []).length
    expect(esCount(out[0]!)).toBeLessThan(esCount(out[P - 1]!))
    const last = out[P - 1]!
    expect(last).toMatch(/tiempo/i)
    expect(last).toMatch(/vida/i)
    expect(last).toMatch(/noche/i)
  })

  it('maxLearnWords limits which lemmas can appear as L2', () => {
    const htmlBlocks = ['<p>time and life and night.</p>']
    const plainBlocks = ['time and life and night.']
    const out = blendProgressiveHtml({
      htmlBlocks,
      plainBlocks,
      lexicon: miniLex,
      paceGamma: 1,
      maxLearnWords: 1,
    })
    const html = out[0]!
    const l2Hits = [html.includes('tiempo'), html.includes('vida'), html.includes('noche')].filter(
      Boolean,
    ).length
    expect(l2Hits).toBe(1)
  })
})
