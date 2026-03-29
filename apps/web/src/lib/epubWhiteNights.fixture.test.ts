import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

/**
 * White Nights (Dostoevsky) — user-provided EPUB in repo `fixtures/epub/`.
 * Vitest cwd is `apps/web`.
 */
export const WHITE_NIGHTS_FIXTURE_EPUB = resolve(
  process.cwd(),
  '../../fixtures/epub/white-nights-fyodor-dostoevsky.epub',
)

describe('White Nights EPUB (fixture)', () => {
  it('fixture file is present', () => {
    expect(existsSync(WHITE_NIGHTS_FIXTURE_EPUB)).toBe(true)
  })

  it('is a valid EPUB zip', async () => {
    const buf = readFileSync(WHITE_NIGHTS_FIXTURE_EPUB)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    const zip = await JSZip.loadAsync(buf)
    const mimetype = await zip.file('mimetype')?.async('string')
    expect(mimetype?.trim()).toBe('application/epub+zip')
  })

  it('contains typical chapter text from the sample (HTML in spine)', async () => {
    const buf = readFileSync(WHITE_NIGHTS_FIXTURE_EPUB)
    const zip = await JSZip.loadAsync(buf)
    const names = Object.keys(zip.files)
    const xhtml = await Promise.all(
      names
        .filter((n) => /\.(xhtml|html)$/i.test(n) && !zip.files[n].dir)
        .slice(0, 40)
        .map(async (n) => {
          const s = await zip.file(n)?.async('string')
          return s ?? ''
        }),
    )
    const blob = xhtml.join('\n').toLowerCase()
    expect(blob).toMatch(/nastenka|letter|matrona|dearie|moment/)
  })
})
