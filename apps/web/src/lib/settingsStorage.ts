import { defaultSettings, type ReaderSettings } from '../types/book'

const KEY = 'progressive-reader-settings-v1'

export function loadUiSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSettings }
    const p = JSON.parse(raw) as Partial<ReaderSettings> & {
      sentenceTranslateAfterLemma?: number
    }
    const merged = { ...defaultSettings, ...p }
    const cap =
      typeof merged.learnWordCap === 'number' && Number.isFinite(merged.learnWordCap)
        ? Math.round(merged.learnWordCap)
        : defaultSettings.learnWordCap
    merged.learnWordCap = Math.max(1, Math.min(5000, cap))
    merged.sentenceTranslateEnabled = Boolean(merged.sentenceTranslateEnabled)
    const rawSight =
      typeof p.sentenceTranslateAfterSightings === 'number' &&
      Number.isFinite(p.sentenceTranslateAfterSightings)
        ? Math.round(p.sentenceTranslateAfterSightings)
        : typeof p.sentenceTranslateAfterLemma === 'number' &&
            Number.isFinite(p.sentenceTranslateAfterLemma)
          ? Math.round(p.sentenceTranslateAfterLemma)
          : defaultSettings.sentenceTranslateAfterSightings
    merged.sentenceTranslateAfterSightings = Math.max(1, Math.min(5000, rawSight))
    delete (merged as { sentenceTranslateAfterLemma?: unknown }).sentenceTranslateAfterLemma
    merged.sentenceTranslateWhen =
      merged.sentenceTranslateWhen === 'from_beginning'
        ? 'from_beginning'
        : 'after_lexicon_sightings'
    merged.sentenceTranslateStyle =
      merged.sentenceTranslateStyle === 'tap_to_reveal'
        ? 'tap_to_reveal'
        : merged.sentenceTranslateStyle === 'replace_sentence'
          ? 'replace_sentence'
          : 'replace_paragraph'
    return merged
  } catch {
    return { ...defaultSettings }
  }
}

export function saveUiSettings(s: ReaderSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
