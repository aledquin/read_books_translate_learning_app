import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ATTR_PR_GLOSS_EN } from '../lib/progressiveBlendCore'
import {
  buildCheckpoint,
  scrollContainerToCheckpoint,
} from '../lib/readingCheckpoint'
import {
  isMyMemoryQuotaExceededError,
  translatePlainEnglishParagraph,
} from '../lib/mymemoryTranslate'
import { englishWordGrammarLine } from '../lib/wordGloss'
import type { BookRecord, ReaderSettings, ReadingCheckpoint } from '../types/book'
import { readerFontClass } from '../lib/readerUi'
import type { BlendPhase } from '../lib/buildBlendedOutput'
import { ProgressBar } from './ProgressBar'

type TapTranslationEntry =
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'error'; message: string }

type GlossPayload = {
  en: string
  es?: string
  grammar?: string
}

function closestGlossTarget(start: EventTarget | null): HTMLElement | null {
  if (!start || !(start instanceof Node)) return null
  const el = start instanceof Element ? start : start.parentElement
  return el?.closest?.(`span[lang="es"][${ATTR_PR_GLOSS_EN}]`) ?? null
}

type ReaderViewProps = {
  record: BookRecord
  ui: ReaderSettings
  readerHtmls: string[]
  lookupLex: Record<string, string>
  busy: boolean
  progress: { phase: BlendPhase; c: number; t: number } | null
  showTapSentenceUi: boolean
  sentenceReplaceInPlace: boolean
  bookHasBundledSentenceEs: boolean
  tapTranslationByIndex: Record<number, TapTranslationEntry>
  setTapTranslationByIndex: React.Dispatch<
    React.SetStateAction<Record<number, TapTranslationEntry>>
  >
  onPersistCheckpoint: (checkpoint: ReadingCheckpoint) => void
  onMyMemoryQuota: (message: string) => void
}

export function ReaderView({
  record,
  ui,
  readerHtmls,
  lookupLex,
  busy,
  progress,
  showTapSentenceUi,
  sentenceReplaceInPlace,
  bookHasBundledSentenceEs,
  tapTranslationByIndex,
  setTapTranslationByIndex,
  onPersistCheckpoint,
  onMyMemoryQuota,
}: ReaderViewProps) {
  const scrollRef = useRef<HTMLElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRestoreKeyRef = useRef<string>('')
  const [hoverGloss, setHoverGloss] = useState<GlossPayload | null>(null)
  const [stickyGloss, setStickyGloss] = useState<GlossPayload | null>(null)
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showGloss = stickyGloss ?? hoverGloss
  const grammarFor = useCallback(
    (en: string) =>
      ui.showWordGrammarInTooltip ? englishWordGrammarLine(en) ?? undefined : undefined,
    [ui.showWordGrammarInTooltip],
  )

  const scheduleSaveScroll = useCallback(() => {
    if (!ui.readingCheckpointEnabled) return
    const el = scrollRef.current
    if (!el) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      onPersistCheckpoint(buildCheckpoint(el))
    }, 450)
  }, [ui.readingCheckpointEnabled, onPersistCheckpoint])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const cp = record.readingCheckpoint
    if (!el || !cp || cp.scrollTop <= 0) return
    const key = `${record.id}:${record.blendVersion ?? 0}:${record.blendedHtml?.length ?? 0}`
    if (lastRestoreKeyRef.current === key) return
    lastRestoreKeyRef.current = key
    scrollContainerToCheckpoint(el, cp)
  }, [
    record.id,
    record.blendVersion,
    record.blendedHtml?.length,
    record.readingCheckpoint,
  ])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (stickyGloss) return
      const span = closestGlossTarget(e.target)
      if (!span) {
        if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current)
        hoverClearTimer.current = setTimeout(() => setHoverGloss(null), 120)
        return
      }
      if (hoverClearTimer.current) {
        clearTimeout(hoverClearTimer.current)
        hoverClearTimer.current = null
      }
      const en = span.getAttribute(ATTR_PR_GLOSS_EN)?.trim() ?? ''
      const es = span.textContent?.trim() ?? ''
      if (!en) return
      setHoverGloss({
        en,
        es: es || undefined,
        grammar: grammarFor(en),
      })
    },
    [stickyGloss, grammarFor],
  )

  const onPointerLeaveArticle = useCallback(() => {
    if (!stickyGloss) setHoverGloss(null)
  }, [stickyGloss])

  const onArticleClick = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const span = closestGlossTarget(e.target)
      if (span) {
        const en = span.getAttribute(ATTR_PR_GLOSS_EN)?.trim() ?? ''
        const es = span.textContent?.trim() ?? ''
        if (en) {
          setStickyGloss({
            en,
            es: es || undefined,
            grammar: grammarFor(en),
          })
          e.stopPropagation()
          return
        }
      }
      if (stickyGloss && e.target === e.currentTarget) {
        setStickyGloss(null)
      }
    },
    [stickyGloss, grammarFor],
  )

  const onReaderMouseUp = useCallback(() => {
    const sel = window.getSelection()
    const raw = sel?.toString().trim() ?? ''
    if (!raw || raw.includes(' ')) return
    const w = raw.replace(/[^a-zA-Z'-]/g, '')
    if (!w) return
    const hit = lookupLex[w.toLowerCase()]
    if (!hit) {
      setStickyGloss(null)
      return
    }
    setStickyGloss({
      en: w,
      es: hit,
      grammar: grammarFor(w),
    })
  }, [lookupLex, grammarFor])

  return (
    <>
      {busy && !record.blendedHtml && progress ? (
        <div className="progress-wrap">
          <ProgressBar current={progress.c} total={progress.t} />
        </div>
      ) : null}
      {record.blendedHtml ? (
        <p className="hint pr-legend">
          Dotted underline: first time that word appears in Spanish. Later in the book, more of each
          paragraph shifts to Spanish; the last sections use your full word list.
          {ui.readingCheckpointEnabled
            ? ' Your scroll position is saved automatically for this book.'
            : null}
          {' '}
          Hover or tap a tinted Spanish word for the English original
          {ui.showWordGrammarInTooltip ? ' and a short grammar tag' : ''}. Select one English word
          for its Spanish gloss from the lexicon.
          {ui.pairId === 'en-es' && !ui.sentenceTranslateEnabled
            ? ' Turn on “Sentence translation” in Settings for full sentences (replace and/or tap under each paragraph).'
            : null}
          {bookHasBundledSentenceEs ? (
            <>
              {' '}
              This book includes a Spanish EPUB paired at import: sentence modes use that text when a
              paragraph matches (no API for those blocks).
            </>
          ) : null}
          {ui.sentenceTranslateEnabled &&
          ui.pairId === 'en-es' &&
          ui.sentenceTranslateStyle === 'tap_to_reveal'
            ? bookHasBundledSentenceEs
              ? ' Tap “Show Spanish” for paragraphs without bundled text (others show instantly).'
              : ' Tap “Show Spanish” under a paragraph to load translation (internet).'
            : null}
          {ui.sentenceTranslateEnabled &&
          ui.pairId === 'en-es' &&
          sentenceReplaceInPlace &&
          ui.sentenceTranslateWhen === 'from_beginning'
            ? ui.sentenceTranslateStyle === 'replace_sentence'
              ? ' Replace-by-sentence: after blending, each paragraph switches to Spanish one sentence at a time (same rules as Settings).'
              : ' Replace paragraph: blocks switch to full Spanish from the start of the book (after blending).'
            : null}
          {ui.sentenceTranslateEnabled &&
          ui.pairId === 'en-es' &&
          sentenceReplaceInPlace &&
          ui.sentenceTranslateWhen === 'after_lexicon_sightings'
            ? ui.sentenceTranslateStyle === 'replace_sentence'
              ? ` Replace-by-sentence: each lexicon word must appear ${ui.sentenceTranslateAfterSightings} times before a sentence containing it switches to full Spanish; other sentences stay word-by-word mixed.`
              : ` Replace paragraph: after ${ui.sentenceTranslateAfterSightings} lexicon word sightings, later blocks switch to full Spanish.`
            : null}
        </p>
      ) : null}
      <article
        ref={scrollRef}
        className={`reader-scroll ${readerFontClass(ui.fontFamily)}`}
        style={
          {
            '--reader-fs': `${ui.fontSizePx}px`,
            '--reader-lh': String(ui.lineHeight),
          } as CSSProperties
        }
        onScroll={scheduleSaveScroll}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeaveArticle}
        onClick={onArticleClick}
        onMouseUp={onReaderMouseUp}
      >
        {record.blocks.map((b, i) => {
          const prev = record.blocks[i - 1]
          const showCh = !prev || prev.chapterIndex !== b.chapterIndex
          const html = readerHtmls[i] ?? ''
          const plainTrim = b.plain.trim()
          const tap = tapTranslationByIndex[b.globalIndex]
          const tapPlain = showTapSentenceUi && plainTrim
          return (
            <div key={b.globalIndex} data-pr-block-global={String(b.globalIndex)}>
              {showCh ? <div className="chapter-label">{b.chapterTitle}</div> : null}
              {tapPlain ? (
                <div className="reader-block-wrap pr-tap-wrap">
                  <div className="reader-block" dangerouslySetInnerHTML={{ __html: html }} />
                  <div className="pr-tap-actions">
                    <button
                      type="button"
                      className="btn-link pr-tap-btn"
                      disabled={tap?.status === 'loading'}
                      aria-expanded={tap?.status === 'ready'}
                      aria-label={
                        tap?.status === 'ready'
                          ? 'Hide Spanish translation'
                          : 'Show Spanish translation'
                      }
                      onClick={() => {
                        if (tap?.status === 'ready') {
                          setTapTranslationByIndex((p) => {
                            const n = { ...p }
                            delete n[b.globalIndex]
                            return n
                          })
                          return
                        }
                        if (tap?.status === 'loading') return
                        void (async () => {
                          const bundledTap = b.plainEs?.replace(/\s+/g, ' ').trim() ?? ''
                          if (bundledTap) {
                            setTapTranslationByIndex((p) => ({
                              ...p,
                              [b.globalIndex]: { status: 'ready', text: bundledTap },
                            }))
                            return
                          }
                          setTapTranslationByIndex((p) => ({
                            ...p,
                            [b.globalIndex]: { status: 'loading' },
                          }))
                          try {
                            const text = await translatePlainEnglishParagraph(plainTrim)
                            setTapTranslationByIndex((p) => ({
                              ...p,
                              [b.globalIndex]: { status: 'ready', text },
                            }))
                          } catch (e) {
                            if (isMyMemoryQuotaExceededError(e)) {
                              onMyMemoryQuota(e.message)
                              window.alert(`MyMemory free quota or rate limit\n\n${e.message}`)
                            }
                            setTapTranslationByIndex((p) => ({
                              ...p,
                              [b.globalIndex]: {
                                status: 'error',
                                message: e instanceof Error ? e.message : String(e),
                              },
                            }))
                          }
                        })()
                      }}
                    >
                      {tap?.status === 'loading'
                        ? 'Translating…'
                        : tap?.status === 'ready'
                          ? 'Hide Spanish'
                          : tap?.status === 'error'
                            ? 'Retry Spanish'
                            : 'Show Spanish'}
                    </button>
                  </div>
                  {tap?.status === 'ready' ? (
                    <p className="pr-tap-translation" lang="es">
                      {tap.text}
                    </p>
                  ) : null}
                  {tap?.status === 'error' ? (
                    <p className="hint pr-tap-error" role="alert">
                      {tap.message}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="reader-block" dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          )
        })}
      </article>
      {showGloss ? (
        <div className="word-pop" role="status">
          <div className="word-pop-main">
            <span className="word-pop-en">{showGloss.en}</span>
            {showGloss.es ? (
              <>
                <span className="word-pop-arrow" aria-hidden>
                  →
                </span>
                <span className="word-pop-es" lang="es">
                  {showGloss.es}
                </span>
              </>
            ) : null}
          </div>
          {showGloss.grammar ? (
            <div className="word-pop-grammar hint">{showGloss.grammar}</div>
          ) : null}
          {stickyGloss ? (
            <button
              type="button"
              className="btn-link word-pop-dismiss"
              onClick={() => setStickyGloss(null)}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
