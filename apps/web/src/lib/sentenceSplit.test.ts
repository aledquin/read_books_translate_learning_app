import { describe, expect, it } from 'vitest'
import { splitParagraphIntoSentences } from './sentenceSplit'

describe('splitParagraphIntoSentences', () => {
  it('returns empty for blank', () => {
    expect(splitParagraphIntoSentences('')).toEqual([])
    expect(splitParagraphIntoSentences('   \n')).toEqual([])
  })

  it('keeps one segment when no terminator', () => {
    expect(splitParagraphIntoSentences('No period here')).toEqual(['No period here'])
  })

  it('splits on period question exclamation and ellipsis', () => {
    expect(splitParagraphIntoSentences('First. Second? Third! Done… Fourth')).toEqual([
      'First.',
      'Second?',
      'Third!',
      'Done…',
      'Fourth',
    ])
  })

  it('does not split on comma or colon', () => {
    expect(splitParagraphIntoSentences('A, B: C.')).toEqual(['A, B: C.'])
  })
})
