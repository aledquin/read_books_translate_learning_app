import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../types/book'
import {
  blockQualifiesForSentenceReplace,
  buildAlignedSentenceSpansHtml,
  escapeHtmlText,
} from './sentenceLayer'

function block(plain: string, plainEs?: string): ContentBlock {
  return {
    chapterIndex: 0,
    chapterTitle: '',
    blockIndex: 0,
    globalIndex: 0,
    html: '',
    plain,
    plainEs,
  }
}

describe('escapeHtmlText', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtmlText(`a<b>"c"&`)).toBe('a&lt;b&gt;&quot;c&quot;&amp;')
  })

  it('leaves plain text unchanged', () => {
    expect(escapeHtmlText('hola')).toBe('hola')
  })
})

describe('blockQualifiesForSentenceReplace', () => {
  it('returns false for empty plain', () => {
    expect(blockQualifiesForSentenceReplace(block(''), 0, 5)).toBe(false)
    expect(blockQualifiesForSentenceReplace(block('   '), 0, 5)).toBe(false)
  })

  it('returns true before threshold when plainEs is bundled', () => {
    expect(blockQualifiesForSentenceReplace(block('Hello', 'Hola'), 0, 99)).toBe(true)
  })

  it('returns false before threshold without bundled Spanish', () => {
    expect(blockQualifiesForSentenceReplace(block('Hello'), 0, 5)).toBe(false)
  })

  it('returns true at or after threshold without bundled Spanish', () => {
    expect(blockQualifiesForSentenceReplace(block('Hello'), 5, 5)).toBe(true)
    expect(blockQualifiesForSentenceReplace(block('Hello'), 6, 5)).toBe(true)
  })
})

describe('buildAlignedSentenceSpansHtml', () => {
  it('returns wrapped spans when EN and ES have the same sentence count', () => {
    const html = buildAlignedSentenceSpansHtml('Hello. World.', 'Hola. Mundo.')
    expect(html).toContain('pr-sentence-seg')
    expect(html).toContain('Hola.')
    expect(html).toContain('Mundo.')
  })

  it('returns null when segment counts differ', () => {
    expect(buildAlignedSentenceSpansHtml('A. B. C.', 'One.')).toBe(null)
  })
})
