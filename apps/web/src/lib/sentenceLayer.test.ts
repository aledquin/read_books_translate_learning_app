import { describe, expect, it } from 'vitest'
import { escapeHtmlText } from './sentenceLayer'

describe('escapeHtmlText', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtmlText(`a<b>"c"&`)).toBe('a&lt;b&gt;&quot;c&quot;&amp;')
  })

  it('leaves plain text unchanged', () => {
    expect(escapeHtmlText('hola')).toBe('hola')
  })
})
