export type ThemeId = 'light' | 'dark' | 'sepia'

/** When replace-in-place styles are on, where full Spanish starts. */
export type SentenceTranslateWhen = 'from_beginning' | 'after_lexicon_sightings'

/**
 * `replace_paragraph` swaps the whole block to Spanish; `replace_sentence` splits each block into
 * sentences and aligns/translates per sentence (bundled EPUB must match sentence count or we fall
 * back to one paragraph). `tap_to_reveal` loads Spanish on tap.
 */
export type SentenceTranslateStyle =
  | 'replace_paragraph'
  | 'replace_sentence'
  | 'tap_to_reveal'

export interface ReaderSettings {
  theme: ThemeId
  fontSizePx: number
  lineHeight: number
  fontFamily: 'serif' | 'sans' | 'readable'
  /** >1 = gentler intro of L2; <1 = faster ramp */
  paceGamma: number
  pairId: string
  /** Max distinct lemmas to mix in (priority order); 0 = no cap (all hits). */
  learnWordCap: number
  /**
   * After cumulative lexicon word sightings (document order), following paragraphs use MyMemory
   * EN→ES sentence translation (when on and pair is en-es). Each token that maps to the lexicon
   * counts (repeats count).
   */
  sentenceTranslateEnabled: boolean
  /** Used when replace-in-place style is on and `when` is `after_lexicon_sightings`. */
  sentenceTranslateWhen: SentenceTranslateWhen
  sentenceTranslateStyle: SentenceTranslateStyle
  sentenceTranslateAfterSightings: number
}

export const defaultSettings: ReaderSettings = {
  theme: 'sepia',
  fontSizePx: 19,
  lineHeight: 1.65,
  fontFamily: 'serif',
  paceGamma: 1.35,
  pairId: 'en-es',
  learnWordCap: 100,
  sentenceTranslateEnabled: false,
  sentenceTranslateWhen: 'after_lexicon_sightings',
  sentenceTranslateStyle: 'replace_paragraph',
  sentenceTranslateAfterSightings: 3,
}

export interface ContentBlock {
  chapterIndex: number
  chapterTitle: string
  blockIndex: number
  globalIndex: number
  html: string
  plain: string
  /**
   * Spanish plain text from a companion EPUB, aligned by block order at import.
   * When set, sentence translation / tap-to-reveal use this instead of translation APIs.
   */
  plainEs?: string
}

export interface BookRecord {
  id: string
  title: string
  addedAt: number
  blocks: ContentBlock[]
  blendedHtml: string[] | null
  /** Matches `CURRENT_BLEND_VERSION`; missing/older forces re-blend. */
  blendVersion?: number
  settingsSnapshot: ReaderSettings
}
