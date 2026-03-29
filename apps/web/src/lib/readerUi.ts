import type { ReaderSettings } from '../types/book'

export function applyTheme(theme: ReaderSettings['theme']): void {
  document.documentElement.dataset.theme = theme
}

export function readerFontClass(family: ReaderSettings['fontFamily']): string {
  if (family === 'sans') return 'font-sans'
  if (family === 'readable') return 'font-readable'
  return 'font-serif'
}
