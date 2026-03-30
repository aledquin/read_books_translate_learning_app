/**
 * Rough English sentence-like segments inside one EPUB block (`<p>`, etc.).
 *
 * - **Paragraph start**: the first segment always begins at the start of the block (we do not trim
 *   away intentional leading text).
 * - **Strong boundaries**: `.` `?` `!` and ellipsis `…` followed by whitespace (or end of string).
 *
 * We **do not** split on commas by default: they appear inside many single sentences (“However,
 * …”, lists, appositives). Colons are also skipped: they often introduce a single clause (“He
 * said: nothing”) or lists; splitting there creates many false breaks.
 *
 * This is **not** a full NLP sentence tokenizer (abbreviations like “Mr.” or “e.g.” can still
 * split wrong). Use for UX helpers or future sentence-level UI, not as a gold standard.
 */
export function splitParagraphIntoSentences(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return []
  const parts = t.split(/(?<=[.!?…])\s+/u)
  return parts.map((s) => s.trim()).filter(Boolean)
}
