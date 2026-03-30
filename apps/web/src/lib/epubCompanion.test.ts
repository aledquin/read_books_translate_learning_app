import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../types/book'
import {
  attachSpanishCompanionBlocks,
  bookHasBundledSentenceEs,
  looksLikeSpanishEpubFilename,
  orderEpubFilesEnglishFirst,
} from './epubCompanion'

function block(plain: string, i: number): ContentBlock {
  return {
    chapterIndex: 0,
    chapterTitle: 'Ch',
    blockIndex: i,
    globalIndex: i,
    html: `<p>${plain}</p>`,
    plain,
  }
}

describe('attachSpanishCompanionBlocks', () => {
  it('adds plainEs when counts match', () => {
    const en = [block('Hello', 0), block('World', 1)]
    const es = [block('Hola', 0), block('Mundo', 1)]
    const { blocks, mismatchWarning, linkedParagraphCount } =
      attachSpanishCompanionBlocks(en, es)
    expect(mismatchWarning).toBeUndefined()
    expect(linkedParagraphCount).toBe(2)
    expect(blocks[0]?.plainEs).toBe('Hola')
    expect(blocks[1]?.plainEs).toBe('Mundo')
  })

  it('sets mismatchWarning when block counts differ', () => {
    const en = [block('a', 0), block('b', 1), block('c', 2)]
    const es = [block('x', 0), block('y', 1)]
    const { blocks, mismatchWarning, linkedParagraphCount } =
      attachSpanishCompanionBlocks(en, es)
    expect(linkedParagraphCount).toBe(2)
    expect(mismatchWarning).toContain('3')
    expect(mismatchWarning).toContain('2')
    expect(blocks[0]?.plainEs).toBe('x')
    expect(blocks[1]?.plainEs).toBe('y')
    expect(blocks[2]?.plainEs).toBeUndefined()
  })

  it('skips plainEs when Spanish plain is empty', () => {
    const en = [block('Hi', 0)]
    const es = [{ ...block('', 0), plain: '   ' }]
    const { blocks, linkedParagraphCount } = attachSpanishCompanionBlocks(en, es)
    expect(linkedParagraphCount).toBe(0)
    expect(blocks[0]?.plainEs).toBeUndefined()
  })
})

describe('orderEpubFilesEnglishFirst', () => {
  it('puts non-.es file first when .es.epub was selected first alphabetically', () => {
    const es = new File([], 'reader-feature-sample.es.epub')
    const en = new File([], 'reader-feature-sample.epub')
    const ordered = orderEpubFilesEnglishFirst([es, en])
    expect(ordered[0]?.name).toBe('reader-feature-sample.epub')
    expect(ordered[1]?.name).toBe('reader-feature-sample.es.epub')
  })

  it('leaves order when only one file', () => {
    const a = new File([], 'a.epub')
    expect(orderEpubFilesEnglishFirst([a])).toEqual([a])
  })
})

describe('looksLikeSpanishEpubFilename', () => {
  it('detects common Spanish naming patterns', () => {
    expect(looksLikeSpanishEpubFilename('book.es.epub')).toBe(true)
    expect(looksLikeSpanishEpubFilename('book-es.epub')).toBe(true)
    expect(looksLikeSpanishEpubFilename('My Spanish book.epub')).toBe(true)
    expect(looksLikeSpanishEpubFilename('reader.epub')).toBe(false)
  })
})

describe('bookHasBundledSentenceEs', () => {
  it('is false without plainEs', () => {
    expect(bookHasBundledSentenceEs([block('a', 0)])).toBe(false)
  })

  it('is true when any plainEs set', () => {
    expect(
      bookHasBundledSentenceEs([
        block('a', 0),
        { ...block('b', 1), plainEs: 'b' },
      ]),
    ).toBe(true)
  })
})
