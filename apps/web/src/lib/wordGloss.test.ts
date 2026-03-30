import { describe, expect, it } from 'vitest'
import { englishWordGrammarLine } from './wordGloss'

describe('englishWordGrammarLine', () => {
  it('returns a short tag line for a known noun surface', () => {
    const g = englishWordGrammarLine('table')
    expect(g).toBeTruthy()
    expect(g!.length).toBeGreaterThan(3)
  })

  it('returns null for garbage', () => {
    expect(englishWordGrammarLine('')).toBe(null)
    expect(englishWordGrammarLine('x')).toBe(null)
  })
})
