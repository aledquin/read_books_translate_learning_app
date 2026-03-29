import { defaultSettings, type ReaderSettings } from '../types/book'

const KEY = 'progressive-reader-settings-v1'

export function loadUiSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSettings }
    const p = JSON.parse(raw) as Partial<ReaderSettings>
    return { ...defaultSettings, ...p }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveUiSettings(s: ReaderSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
