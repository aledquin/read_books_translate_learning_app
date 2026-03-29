import { describe, expect, it } from 'vitest'
import { sanitizeChapterHtml } from './sanitize'

describe('sanitizeChapterHtml', () => {
  it('allows basic structural tags', () => {
    const html = '<p>Hello <strong>world</strong></p>'
    expect(sanitizeChapterHtml(html)).toContain('<p>')
    expect(sanitizeChapterHtml(html)).toContain('<strong>')
  })

  it('strips script tags and content', () => {
    const dirty = '<p>ok</p><script>alert(1)</script>'
    const clean = sanitizeChapterHtml(dirty)
    expect(clean).not.toMatch(/script/i)
    expect(clean).toContain('ok')
  })

  it('removes onerror and other event attributes', () => {
    const dirty = '<img src="x" onerror="bad()" alt="a">'
    const clean = sanitizeChapterHtml(dirty)
    expect(clean).not.toMatch(/onerror/i)
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeChapterHtml('')).toBe('')
  })

  it('drops disallowed tags while keeping text when possible', () => {
    const dirty = '<p>a <iframe src="evil"></iframe> b</p>'
    const clean = sanitizeChapterHtml(dirty)
    expect(clean).not.toMatch(/iframe/i)
  })
})
