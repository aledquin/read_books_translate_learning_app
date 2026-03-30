import nlp from 'compromise'

/** Short compromise tag line for tooltips (not a full dictionary definition). */
export function englishWordGrammarLine(surface: string): string | null {
  const w = surface.replace(/[^a-zA-Z'-]/g, '').trim()
  if (w.length < 2) return null
  const term = nlp(w).json()[0]?.terms?.[0]
  const raw = term?.tags
  if (!Array.isArray(raw) || raw.length === 0) return null
  const tags = (raw as string[])
    .filter((t) => typeof t === 'string' && !t.startsWith('#'))
    .slice(0, 5)
  return tags.length ? tags.join(' · ') : null
}
