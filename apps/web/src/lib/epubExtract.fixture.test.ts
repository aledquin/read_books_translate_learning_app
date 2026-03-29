import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractEpub } from './epubExtract'

/** Repo root `fixtures/epub/` (vitest cwd is `apps/web`). */
const FIXTURE = resolve(
  process.cwd(),
  '../../fixtures/epub/sterne-life-and-opinions-of-tristram-shandy-gentleman-illustrations.epub',
)

describe('Sterne Tristram Shandy sample EPUB', () => {
  it('extracts a title and many reading blocks', async () => {
    const buf = readFileSync(FIXTURE)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const { title, blocks } = await extractEpub(ab)

    expect(title.length).toBeGreaterThan(0)
    expect(blocks.length).toBeGreaterThan(20)
    const sample = blocks.map((b) => b.plain).join(' ')
    expect(sample.toLowerCase()).toMatch(/shandy|stern|life/i)
  })
})
