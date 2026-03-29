export type ThemeId = 'light' | 'dark' | 'sepia'

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
   * After the Nth lexicon lemma’s first Spanish occurrence (document order), following
   * paragraphs use free-tier MyMemory EN→ES sentence translation (when on and pair is en-es).
   */
  sentenceTranslateEnabled: boolean
  sentenceTranslateAfterLemma: number
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
  sentenceTranslateAfterLemma: 25,
}

export interface ContentBlock {
  chapterIndex: number
  chapterTitle: string
  blockIndex: number
  globalIndex: number
  html: string
  plain: string
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
