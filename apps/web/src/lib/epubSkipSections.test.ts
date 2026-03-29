import { describe, expect, it } from 'vitest'
import { shouldSkipSpineSection } from './epubSkipSections'

describe('shouldSkipSpineSection', () => {
  it('skips manifest nav property', () => {
    expect(shouldSkipSpineSection({ href: 'content.xhtml', properties: ['nav'] })).toBe(true)
    expect(
      shouldSkipSpineSection({ href: 'x', properties: ['other NAV item'] }),
    ).toBe(true)
  })

  it('does not skip when properties missing or unrelated', () => {
    expect(shouldSkipSpineSection({ href: 'chapter1.xhtml' })).toBe(false)
    expect(shouldSkipSpineSection({ href: 'a.xhtml', properties: ['cover-image'] })).toBe(
      false,
    )
  })

  it('skips common toc / index filenames', () => {
    expect(shouldSkipSpineSection({ href: 'toc.xhtml' })).toBe(true)
    expect(shouldSkipSpineSection({ href: 'path/TOC.html' })).toBe(true)
    expect(shouldSkipSpineSection({ href: 'index.htm' })).toBe(true)
    expect(shouldSkipSpineSection({ href: 'contents.xml' })).toBe(true)
    expect(shouldSkipSpineSection({ href: 'Table_of_Contents.xhtml' })).toBe(true)
  })

  it('does not skip reading chapters with similar-looking names', () => {
    expect(shouldSkipSpineSection({ href: 'toccata.xhtml' })).toBe(false)
    expect(shouldSkipSpineSection({ href: 'indexed-chapter.xhtml' })).toBe(false)
    expect(shouldSkipSpineSection({ href: 'chapter-1.xhtml' })).toBe(false)
  })

  it('handles missing href', () => {
    expect(shouldSkipSpineSection({})).toBe(false)
    expect(shouldSkipSpineSection({ properties: [] })).toBe(false)
  })

  it('strips query and hash from href before basename check', () => {
    expect(shouldSkipSpineSection({ href: 'stuff/toc.xhtml?x=1#frag' })).toBe(true)
  })
})
