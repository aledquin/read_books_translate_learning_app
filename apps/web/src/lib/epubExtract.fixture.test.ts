import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

/**
 * Copy of the user-provided sample at repo `fixtures/epub/`.
 * Vitest cwd is `apps/web`, so path is `../../fixtures/epub/...`.
 */
export const STERNE_FIXTURE_EPUB = resolve(
  process.cwd(),
  '../../fixtures/epub/sterne-life-and-opinions-of-tristram-shandy-gentleman-illustrations.epub',
)

describe('Sterne Tristram Shandy sample EPUB (fixture)', () => {
  it('fixture file is present next to the repo', () => {
    expect(existsSync(STERNE_FIXTURE_EPUB)).toBe(true)
  })

  it('is a ZIP container with EPUB mimetype and an OPF package', async () => {
    const buf = readFileSync(STERNE_FIXTURE_EPUB)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)

    const zip = await JSZip.loadAsync(buf)
    const mimetype = await zip.file('mimetype')?.async('string')
    expect(mimetype?.trim()).toBe('application/epub+zip')

    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    expect(names.some((n) => n.toLowerCase().endsWith('.opf'))).toBe(true)
  })
})

// Note: full `extractEpub()` via epubjs is exercised in the browser (`npm run dev` → Import EPUB).
