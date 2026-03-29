/**
 * MyMemory free translation API (EN→ES). Optional `VITE_MYMEMORY_EMAIL` raises daily quota.
 * @see https://mymemory.translated.net/doc/spec.php
 */

const BASE = 'https://api.mymemory.translated.net/get'

export type MyMemoryJson = {
  responseData?: { translatedText?: string }
  responseStatus?: number
}

/** Split long paragraphs (~free tier friendly; avoids huge query strings). */
export function chunkTextForMyMemory(text: string, maxLen = 420): string[] {
  const t = text.trim()
  if (!t) return []
  if (t.length <= maxLen) return [t]
  const chunks: string[] = []
  for (let i = 0; i < t.length; ) {
    let end = Math.min(i + maxLen, t.length)
    if (end < t.length) {
      const sp = t.lastIndexOf(' ', end)
      if (sp > i) end = sp
    }
    const part = t.slice(i, end).trim()
    if (part) chunks.push(part)
    const next = end > i ? end : i + 1
    if (next <= i) break
    i = next
  }
  return chunks
}

export async function translateEnToEsMyMemory(chunk: string): Promise<string> {
  const trimmed = chunk.trim()
  if (!trimmed) return ''

  const email = import.meta.env.VITE_MYMEMORY_EMAIL
  let url = `${BASE}?q=${encodeURIComponent(trimmed)}&langpair=en|es`
  if (typeof email === 'string' && email.includes('@')) {
    url += `&de=${encodeURIComponent(email.trim())}`
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Translation failed (HTTP ${res.status}).`)

  const data = (await res.json()) as MyMemoryJson
  const out = data.responseData?.translatedText?.trim()
  if (!out) throw new Error('Translation response was empty.')

  const low = out.toLowerCase()
  if (low.includes('mymemory') && (low.includes('warning') || low.includes('quota'))) {
    throw new Error(
      'Translation quota may be exceeded. Set VITE_MYMEMORY_EMAIL for a higher free limit, or try again later.',
    )
  }

  return out
}
