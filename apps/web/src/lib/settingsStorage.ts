import { defaultSettings, type ReaderSettings } from '../types/book'

const KEY = 'progressive-reader-settings-v1'

export function loadUiSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSettings }
    const p = JSON.parse(raw) as Partial<ReaderSettings>
    const merged = { ...defaultSettings, ...p }
    const cap =
      typeof merged.learnWordCap === 'number' && Number.isFinite(merged.learnWordCap)
        ? Math.round(merged.learnWordCap)
        : defaultSettings.learnWordCap
    merged.learnWordCap = Math.max(1, Math.min(5000, cap))
    merged.sentenceTranslateEnabled = Boolean(merged.sentenceTranslateEnabled)
    const after =
      typeof merged.sentenceTranslateAfterLemma === 'number' &&
      Number.isFinite(merged.sentenceTranslateAfterLemma)
        ? Math.round(merged.sentenceTranslateAfterLemma)
        : defaultSettings.sentenceTranslateAfterLemma
    merged.sentenceTranslateAfterLemma = Math.max(1, Math.min(5000, after))
    return merged
  } catch {
    return { ...defaultSettings }
  }
}

export function saveUiSettings(s: ReaderSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
