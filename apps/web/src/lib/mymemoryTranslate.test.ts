import { describe, expect, it } from 'vitest'
import { chunkTextForMyMemory } from './mymemoryTranslate'

describe('chunkTextForMyMemory', () => {
  it('returns single chunk for short text', () => {
    expect(chunkTextForMyMemory('hello world', 100)).toEqual(['hello world'])
  })

  it('returns empty for whitespace', () => {
    expect(chunkTextForMyMemory('   ', 50)).toEqual([])
  })

  it('splits long text without breaking mid-word when possible', () => {
    const words = Array.from({ length: 80 }, () => 'word').join(' ')
    const chunks = chunkTextForMyMemory(words, 40)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(words.trim())
  })
})
