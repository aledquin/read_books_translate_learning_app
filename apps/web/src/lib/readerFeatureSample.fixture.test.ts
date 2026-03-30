import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

/**
 * Built by: `node scripts/build-reader-feature-epub.mjs` (from `apps/web`).
 */
export const READER_FEATURE_SAMPLE_EPUB = resolve(
  process.cwd(),
  '../../fixtures/epub/reader-feature-sample.epub',
)

/** Spanish companion (same block order); built by the same script as the English fixture. */
export const READER_FEATURE_SAMPLE_EPUB_ES = resolve(
  process.cwd(),
  '../../fixtures/epub/reader-feature-sample.es.epub',
)

describe('Reader feature sample EPUB (fixture)', () => {
  it('English and Spanish fixture files are present', () => {
    expect(existsSync(READER_FEATURE_SAMPLE_EPUB)).toBe(true)
    expect(existsSync(READER_FEATURE_SAMPLE_EPUB_ES)).toBe(true)
  })

  it('is a valid EPUB zip with two chapters and mixed HTML (no extractEpub — avoids CI timeouts)', async () => {
    const buf = readFileSync(READER_FEATURE_SAMPLE_EPUB)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    const zip = await JSZip.loadAsync(buf)
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    expect(names.some((n) => /package\.opf$/i.test(n))).toBe(true)
    expect(names.some((n) => /ch1\.xhtml$/i.test(n))).toBe(true)
    expect(names.some((n) => /ch2\.xhtml$/i.test(n))).toBe(true)

    const ch1 = (await zip.file('OEBPS/ch1.xhtml')?.async('string')) ?? ''
    const ch2 = (await zip.file('OEBPS/ch2.xhtml')?.async('string')) ?? ''
    const blob = (ch1 + ch2).toLowerCase()
    expect(blob).toMatch(/<p\b/)
    expect(blob).toMatch(/<h2\b/)
    expect(blob).toMatch(/<blockquote\b/)
    expect(blob).toMatch(/<li\b/)
    expect(blob).toMatch(/time|house|love|city/)
    const pCount = (blob.match(/<p\b/g) ?? []).length
    const liCount = (blob.match(/<li\b/g) ?? []).length
    expect(pCount + liCount + 2).toBeGreaterThanOrEqual(16)
  })
})
