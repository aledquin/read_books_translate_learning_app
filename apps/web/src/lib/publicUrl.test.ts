import { describe, expect, it } from 'vitest'
import { publicUrl } from './publicUrl'

describe('publicUrl', () => {
  it('joins base URL with path without duplicate slashes', () => {
    const base = import.meta.env.BASE_URL
    expect(publicUrl('lexicons/en-es.json')).toBe(`${base}lexicons/en-es.json`)
  })

  it('strips leading slashes from path argument', () => {
    const base = import.meta.env.BASE_URL
    expect(publicUrl('/lexicons/a.json')).toBe(`${base}lexicons/a.json`)
  })

  it('handles multiple leading slashes', () => {
    const base = import.meta.env.BASE_URL
    expect(publicUrl('///x/y')).toBe(`${base}x/y`)
  })
})
