import { describe, expect, it } from 'vitest'
import {
  chunkTextForGoogleCloud,
  chunkTextForMyMemory,
  isMyMemoryQuotaExceededError,
  MyMemoryQuotaExceededError,
} from './mymemoryTranslate'

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

describe('chunkTextForGoogleCloud', () => {
  it('returns single chunk under limit', () => {
    expect(chunkTextForGoogleCloud('short text', 100)).toEqual(['short text'])
  })

  it('returns empty for whitespace', () => {
    expect(chunkTextForGoogleCloud('   ', 50)).toEqual([])
  })

  it('splits long text and preserves words when possible', () => {
    const words = Array.from({ length: 2000 }, () => 'w').join(' ')
    const chunks = chunkTextForGoogleCloud(words, 80)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(words.trim())
  })
})

describe('MyMemoryQuotaExceededError', () => {
  it('is detected by isMyMemoryQuotaExceededError', () => {
    const e = new MyMemoryQuotaExceededError('daily quota')
    expect(isMyMemoryQuotaExceededError(e)).toBe(true)
    expect(isMyMemoryQuotaExceededError(new Error('other'))).toBe(false)
  })
})
