export type ThemeId = 'light' | 'dark' | 'sepia'

export interface ReaderSettings {
  theme: ThemeId
  fontSizePx: number
  lineHeight: number
  fontFamily: 'serif' | 'sans' | 'readable'
  /** >1 = gentler intro of L2; <1 = faster ramp */
  paceGamma: number
  pairId: string
}

export const defaultSettings: ReaderSettings = {
  theme: 'sepia',
  fontSizePx: 19,
  lineHeight: 1.65,
  fontFamily: 'serif',
  paceGamma: 1.35,
  pairId: 'en-es',
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
