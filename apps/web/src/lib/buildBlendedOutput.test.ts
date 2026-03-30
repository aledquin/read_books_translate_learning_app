import { describe, expect, it } from 'vitest'
import { defaultSettings, type ReaderSettings } from '../types/book'
import {
  blendedBlockHasSentenceMt,
  sentenceTranslationIssueMessage,
} from './buildBlendedOutput'

const enEs: ReaderSettings = { ...defaultSettings, pairId: 'en-es' }

describe('blendedBlockHasSentenceMt', () => {
  it('detects sentence-layer markup', () => {
    expect(blendedBlockHasSentenceMt('<p class="pr-sentence-mt" lang="es">Hola</p>')).toBe(true)
    expect(blendedBlockHasSentenceMt('<p><span lang="es">x</span></p>')).toBe(false)
  })
})

describe('sentenceTranslationIssueMessage', () => {
  it('returns null when sentence mode is off', () => {
    const ui = { ...enEs, sentenceTranslateEnabled: false }
    expect(sentenceTranslationIssueMessage(ui, ['time'], { time: 'x' }, ['<p>a</p>'])).toBe(null)
  })

  it('returns null when pair is not en-es', () => {
    const ui = { ...defaultSettings, pairId: 'other', sentenceTranslateEnabled: true }
    expect(sentenceTranslationIssueMessage(ui, ['time'], { time: 'x' }, ['<p>a</p>'])).toBe(null)
  })

  it('returns null when at least one block has sentence MT', () => {
    const ui = { ...enEs, sentenceTranslateEnabled: true }
    const blended = ['<p class="pr-sentence-mt" lang="es">Hola</p>', '<p>x</p>']
    expect(sentenceTranslationIssueMessage(ui, ['a', 'b'], { time: 't' }, blended)).toBe(null)
  })

  it('returns null for tap-to-reveal (no bulk replace expected)', () => {
    const ui = {
      ...enEs,
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'tap_to_reveal' as const,
    }
    expect(sentenceTranslationIssueMessage(ui, ['a'], {}, ['<p>x</p>'])).toBe(null)
  })

  it('explains when start index never occurs (threshold too high)', () => {
    const ui = {
      ...enEs,
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'replace_paragraph' as const,
      sentenceTranslateWhen: 'after_lexicon_sightings' as const,
      sentenceTranslateAfterSightings: 99,
    }
    const msg = sentenceTranslationIssueMessage(
      ui,
      ['only one time'],
      { time: 'tiempo' },
      ['<p>x</p>', '<p>y</p>'],
    )
    expect(msg).toContain('never starts')
    expect(msg).toContain('99')
  })

  it('explains MyMemory path when start is in range but no MT blocks', () => {
    const ui = {
      ...enEs,
      sentenceTranslateEnabled: true,
      sentenceTranslateStyle: 'replace_paragraph' as const,
      sentenceTranslateWhen: 'after_lexicon_sightings' as const,
      sentenceTranslateAfterSightings: 1,
    }
    const msg = sentenceTranslationIssueMessage(
      ui,
      ['time flies', 'more'],
      { time: 'tiempo', flies: 'vuela' },
      ['<p>mixed</p>', '<p>still mixed</p>'],
    )
    expect(msg).toContain('MyMemory')
  })
})
