import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countEpubReadingBlocks } from './epubZipBlockCount'

const whiteNightsEn = resolve(
  process.cwd(),
  '../../fixtures/epub/white-nights-fyodor-dostoevsky.epub',
)

const whiteNightsEs = resolve(
  process.cwd(),
  '../../fixtures/epub/white-nights-fyodor-dostoevsky.es.epub',
)

const readerFeatureEn = resolve(
  process.cwd(),
  '../../fixtures/epub/reader-feature-sample.epub',
)

const readerFeatureEs = resolve(
  process.cwd(),
  '../../fixtures/epub/reader-feature-sample.es.epub',
)

describe('countEpubReadingBlocks', () => {
  it('matches reader-feature-sample English block JSON length (20)', async () => {
    const buf = readFileSync(readerFeatureEn)
    const { total } = await countEpubReadingBlocks(buf)
    expect(total).toBe(20)
  })

  it('matches reader-feature-sample Spanish companion block count', async () => {
    const enBuf = readFileSync(readerFeatureEn)
    const esBuf = readFileSync(readerFeatureEs)
    const a = await countEpubReadingBlocks(enBuf)
    const b = await countEpubReadingBlocks(esBuf)
    expect(a.total).toBe(b.total)
  })

  it('White Nights (English) yields a substantial reading block count for companion QA', async () => {
    const buf = readFileSync(whiteNightsEn)
    const { total, opfPath } = await countEpubReadingBlocks(buf)
    expect(opfPath).toBeTruthy()
    expect(total).toBeGreaterThan(80)
    expect(total).toBeLessThan(8000)
  })

  it.skipIf(!existsSync(whiteNightsEs))(
    'White Nights Spanish companion matches English block count',
    async () => {
      const enBuf = readFileSync(whiteNightsEn)
      const esBuf = readFileSync(whiteNightsEs)
      const a = await countEpubReadingBlocks(enBuf)
      const b = await countEpubReadingBlocks(esBuf)
      expect(a.total).toBe(b.total)
    },
  )
})
