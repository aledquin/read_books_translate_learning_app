import { publicUrl } from './publicUrl'
import type { BookRecord, ReaderSettings } from '../types/book'

export const NO_L2_BLEND_WARNING =
  'No Spanish replacements were made: this book may not use words from the bundled lexicon (English lemmas in public/lexicons/en-es.json). Try another title or add words to the lexicon.'

export const LEXICON_LOAD_ERROR_HINT =
  'Could not load lexicon (check URL base for GitHub Pages).'

export function blendSettingsMatch(rec: BookRecord, ui: ReaderSettings): boolean {
  const snap = rec.settingsSnapshot
  const snapCap = snap.learnWordCap ?? 100
  const snapSent = snap.sentenceTranslateEnabled ?? false
  const snapAfter = snap.sentenceTranslateAfterLemma ?? 25
  return (
    snap.pairId === ui.pairId &&
    snap.paceGamma === ui.paceGamma &&
    snapCap === ui.learnWordCap &&
    snapSent === ui.sentenceTranslateEnabled &&
    snapAfter === ui.sentenceTranslateAfterLemma
  )
}

export function snapshotForBook(ui: ReaderSettings): ReaderSettings {
  return { ...ui }
}

export async function loadLexicon(pairId: string): Promise<Record<string, string>> {
  const url = publicUrl(`lexicons/${pairId}.json`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Missing lexicon (${res.status}): ${url}`)
  return (await res.json()) as Record<string, string>
}

export function assertLexiconNonEmpty(lex: Record<string, string>): void {
  if (Object.keys(lex).length === 0) {
    throw new Error('Lexicon is empty — check lexicon JSON and deploy path.')
  }
}

export function blendedOutputHasL2(blended: string[]): boolean {
  return blended.some((h) => h.includes('lang="es"'))
}

export function isBlendUpToDate(
  record: BookRecord,
  ui: ReaderSettings,
  blendVersion: number,
): boolean {
  return (
    !!record.blendedHtml &&
    record.blendedHtml.length === record.blocks.length &&
    record.blendVersion === blendVersion &&
    blendSettingsMatch(record, ui)
  )
}
