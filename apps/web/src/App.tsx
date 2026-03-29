import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { SettingsSheet } from './components/SettingsSheet'
import { ProgressBar } from './components/ProgressBar'
import * as db from './lib/db'
import {
  assertLexiconNonEmpty,
  blendedOutputHasL2,
  isBlendUpToDate,
  LEXICON_LOAD_ERROR_HINT,
  loadLexicon,
  NO_L2_BLEND_WARNING,
  snapshotForBook,
} from './lib/bookBlend'
import {
  buildBlendedHtmlPipeline,
  type BlendPhase,
} from './lib/buildBlendedOutput'
import { CURRENT_BLEND_VERSION } from './lib/blendVersion'
import { extractEpub } from './lib/epubExtract'
import { getReplacementWordList } from './lib/progressiveBlendCore'
import { applyTheme, readerFontClass } from './lib/readerUi'
import { loadUiSettings, saveUiSettings } from './lib/settingsStorage'
import type { BookRecord, ReaderSettings } from './types/book'

export default function App() {
  const [ui, setUi] = useState<ReaderSettings>(() => loadUiSettings())
  const [books, setBooks] = useState<Awaited<ReturnType<typeof db.listBooks>>>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [record, setRecord] = useState<BookRecord | null>(null)
  const [lookupLex, setLookupLex] = useState<Record<string, string>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftUi, setDraftUi] = useState<ReaderSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{
    phase: BlendPhase
    c: number
    t: number
  } | null>(null)
  const [selectionHint, setSelectionHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blendWarning, setBlendWarning] = useState<string | null>(null)
  const [readerTab, setReaderTab] = useState<'read' | 'vocab'>('read')
  const [vocabFilter, setVocabFilter] = useState('')

  const refreshLibrary = useCallback(async () => {
    setBooks(await db.listBooks())
  }, [])

  useEffect(() => {
    applyTheme(ui.theme)
    saveUiSettings(ui)
  }, [ui])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  const openSettings = useCallback(() => {
    setDraftUi({ ...ui })
    setSettingsOpen(true)
  }, [ui])

  const applySettings = useCallback(() => {
    if (draftUi) setUi(draftUi)
    setSettingsOpen(false)
    setDraftUi(null)
  }, [draftUi])

  const cancelSettings = useCallback(() => {
    setSettingsOpen(false)
    setDraftUi(null)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, cancelSettings])

  useEffect(() => {
    setReaderTab('read')
    setVocabFilter('')
  }, [activeId])

  useEffect(() => {
    if (!activeId) {
      setRecord(null)
      setLookupLex({})
      setBlendWarning(null)
      return
    }
    let cancel = false
    void (async () => {
      let r = await db.loadBook(activeId)
      if (r?.blendedHtml && r.blendVersion !== CURRENT_BLEND_VERSION) {
        r = { ...r, blendedHtml: null }
      }
      if (!cancel) setRecord(r ?? null)
      try {
        const lex = await loadLexicon(ui.pairId)
        if (!cancel) setLookupLex(lex)
      } catch (e) {
        if (!cancel) {
          setLookupLex({})
          setError(e instanceof Error ? e.message : LEXICON_LOAD_ERROR_HINT)
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [activeId, ui.pairId])

  useEffect(() => {
    if (!record) return
    if (isBlendUpToDate(record, ui, CURRENT_BLEND_VERSION)) return

    let cancelled = false
    void (async () => {
      setBusy(true)
      setProgress({ phase: 'blend', c: 0, t: record.blocks.length })
      setError(null)
      setBlendWarning(null)
      try {
        const lex = await loadLexicon(ui.pairId)
        if (cancelled) return
        assertLexiconNonEmpty(lex)

        const blended = await buildBlendedHtmlPipeline(
          record.blocks,
          lex,
          ui,
          (phase, c, t) => {
            if (!cancelled) setProgress({ phase, c, t })
          },
        )
        if (cancelled) return

        const next: BookRecord = {
          ...record,
          blendedHtml: blended,
          blendVersion: CURRENT_BLEND_VERSION,
          settingsSnapshot: snapshotForBook(ui),
        }
        await db.saveBook(next)
        setRecord(next)
        if (!blendedOutputHasL2(blended) && blended.length > 0) {
          setBlendWarning(NO_L2_BLEND_WARNING)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) {
          setBusy(false)
          setProgress(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    record,
    ui.pairId,
    ui.paceGamma,
    ui.learnWordCap,
    ui.sentenceTranslateEnabled,
    ui.sentenceTranslateAfterLemma,
  ])

  const onPickFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    setBlendWarning(null)
    setBusy(true)
    setProgress({ phase: 'blend', c: 0, t: 1 })
    const id = crypto.randomUUID()
    let title = file.name.replace(/\.epub$/i, '')
    let blocks: BookRecord['blocks'] = []
    try {
      const buf = await file.arrayBuffer()
      const extracted = await extractEpub(buf)
      if (extracted.blocks.length === 0) {
        throw new Error('No readable paragraphs in this EPUB.')
      }
      title = extracted.title
      blocks = extracted.blocks
      setProgress({ phase: 'blend', c: 0, t: blocks.length })

      const lex = await loadLexicon(ui.pairId)
      assertLexiconNonEmpty(lex)

      const blended = await buildBlendedHtmlPipeline(blocks, lex, ui, (phase, c, t) =>
        setProgress({ phase, c, t }),
      )

      const rec: BookRecord = {
        id,
        title,
        addedAt: Date.now(),
        blocks,
        blendedHtml: blended,
        blendVersion: CURRENT_BLEND_VERSION,
        settingsSnapshot: snapshotForBook(ui),
      }
      await db.saveBook(rec)
      await refreshLibrary()
      setBlendWarning(
        !blendedOutputHasL2(blended) && blended.length > 0 ? NO_L2_BLEND_WARNING : null,
      )
      setActiveId(id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      if (blocks.length > 0) {
        await db.saveBook({
          id,
          title,
          addedAt: Date.now(),
          blocks,
          blendedHtml: null,
          settingsSnapshot: snapshotForBook(ui),
        })
        await refreshLibrary()
      }
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const onReaderMouseUp = () => {
    const sel = window.getSelection()
    const raw = sel?.toString().trim() ?? ''
    if (!raw || raw.includes(' ')) {
      setSelectionHint(null)
      return
    }
    const w = raw.replace(/[^a-zA-Z'-]/g, '')
    if (!w) {
      setSelectionHint(null)
      return
    }
    const hit = lookupLex[w.toLowerCase()]
    setSelectionHint(hit ? `${w} → ${hit}` : null)
  }

  const showReader = Boolean(activeId && record)
  const readerHtmls =
    showReader && record
      ? (record.blendedHtml ?? record.blocks.map((b) => b.html))
      : []

  const replacementRows = useMemo(() => {
    if (!record || Object.keys(lookupLex).length === 0) return []
    return getReplacementWordList(
      record.blocks.map((b) => b.plain),
      lookupLex,
      ui.learnWordCap,
    )
  }, [record, lookupLex, ui.learnWordCap])

  const filteredReplacements = useMemo(() => {
    const q = vocabFilter.trim().toLowerCase()
    if (!q) return replacementRows
    return replacementRows.filter(
      (r) => r.en.toLowerCase().includes(q) || r.es.toLowerCase().includes(q),
    )
  }, [replacementRows, vocabFilter])

  const onRemoveBook = async (id: string) => {
    if (!window.confirm('Remove this book from the library?')) return
    setError(null)
    try {
      await db.deleteBook(id)
      await refreshLibrary()
      if (activeId === id) setActiveId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        {showReader ? (
          <button type="button" className="btn" onClick={() => setActiveId(null)}>
            Library
          </button>
        ) : (
          <h1>Progressive Reader</h1>
        )}
        <button type="button" className="btn" onClick={openSettings}>
          Settings
        </button>
      </header>

      {error ? <p className="hint">{error}</p> : null}
      {blendWarning ? <p className="hint blend-warning">{blendWarning}</p> : null}

      {busy && !showReader ? (
        <div className="import-progress">
          <p className="hint">
            {progress?.phase === 'sentence'
              ? 'Translating sentences (MyMemory free tier, internet required)…'
              : 'Extracting and blending…'}
          </p>
          {progress ? <ProgressBar current={progress.c} total={progress.t} /> : null}
        </div>
      ) : null}

      {showReader && record ? (
        <>
          <div className="reader-title-row">
            <div className="hint reader-title-hint">
              {record.title}
              {busy
                ? ` — ${progress?.phase === 'sentence' ? 'sentences' : 'blending'} ${progress?.c ?? 0}/${progress?.t ?? '…'}`
                : null}
            </div>
            <button
              type="button"
              className="btn-link danger"
              onClick={() => void onRemoveBook(record.id)}
            >
              Remove
            </button>
          </div>
          <div className="reader-tabs" role="tablist" aria-label="Reader view">
            <button
              type="button"
              role="tab"
              aria-selected={readerTab === 'read'}
              className={readerTab === 'read' ? 'reader-tab active' : 'reader-tab'}
              onClick={() => setReaderTab('read')}
            >
              Read
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={readerTab === 'vocab'}
              className={readerTab === 'vocab' ? 'reader-tab active' : 'reader-tab'}
              onClick={() => setReaderTab('vocab')}
            >
              Words to replace
            </button>
          </div>
          <div className="reader-body">
            {readerTab === 'read' ? (
              <>
                {busy && !record.blendedHtml && progress ? (
                  <ProgressBar current={progress.c} total={progress.t} />
                ) : null}
                {record.blendedHtml ? (
                  <p className="hint pr-legend">
                    Dotted underline: first time that word appears in Spanish. Later in the book,
                    more of each paragraph shifts to Spanish; the last sections use your full word
                    list.
                    {ui.sentenceTranslateEnabled && ui.pairId === 'en-es'
                      ? ' After enough first-seen lemmas, later blocks may show full Spanish sentences (MyMemory).'
                      : null}
                  </p>
                ) : null}
                <article
                  className={`reader-scroll ${readerFontClass(ui.fontFamily)}`}
                  style={
                    {
                      '--reader-fs': `${ui.fontSizePx}px`,
                      '--reader-lh': String(ui.lineHeight),
                    } as CSSProperties
                  }
                  onMouseUp={onReaderMouseUp}
                >
                  {record.blocks.map((b, i) => {
                    const prev = record.blocks[i - 1]
                    const showCh = !prev || prev.chapterIndex !== b.chapterIndex
                    return (
                      <div key={b.globalIndex}>
                        {showCh ? <div className="chapter-label">{b.chapterTitle}</div> : null}
                        <div
                          className="reader-block"
                          dangerouslySetInnerHTML={{ __html: readerHtmls[i] ?? '' }}
                        />
                      </div>
                    )
                  })}
                </article>
              </>
            ) : (
              <div className="vocab-panel">
                <p className="hint vocab-panel-intro">
                  Up to {ui.learnWordCap} English lemmas in blend priority (same order as mixing).
                  Change the cap in Settings to include more or fewer words. Filter to search.
                </p>
                <input
                  type="search"
                  className="vocab-filter"
                  placeholder="Filter English or Spanish…"
                  value={vocabFilter}
                  onChange={(e) => setVocabFilter(e.target.value)}
                  aria-label="Filter replacement words"
                />
                <p className="hint vocab-count">
                  {filteredReplacements.length} of {replacementRows.length} words
                </p>
                <ul className="vocab-list">
                  {filteredReplacements.map((r) => (
                    <li key={r.en}>
                      <span className="vocab-rank">{r.rank}</span>
                      <span className="vocab-en">{r.en}</span>
                      <span className="vocab-arrow" aria-hidden>
                        →
                      </span>
                      <span className="vocab-es" lang="es">
                        {r.es}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <label className="btn file-label">
            <input
              type="file"
              accept=".epub,application/epub+zip"
              disabled={busy}
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
            Import EPUB
          </label>
          <p className="hint">
            English source text plus bundled EN→ES glosses. Each import is extracted and blended on
            your device before it opens (open source: compromise). No LLM API.
          </p>
          <ul className="list library-list" style={{ marginTop: 16 }}>
            {books.map((b) => (
              <li key={b.id} className="library-row">
                <button type="button" className="library-open" onClick={() => setActiveId(b.id)}>
                  <div>{b.title}</div>
                  <div className="sub">{new Date(b.addedAt).toLocaleString()}</div>
                </button>
                <button
                  type="button"
                  className="btn btn-remove"
                  aria-label={`Remove ${b.title}`}
                  onClick={() => void onRemoveBook(b.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectionHint ? (
        <div className="word-pop" role="status">
          {selectionHint}
        </div>
      ) : null}

      {settingsOpen && draftUi ? (
        <SettingsSheet
          draft={draftUi}
          onChange={setDraftUi}
          onApply={applySettings}
          onCancel={cancelSettings}
        />
      ) : null}
    </div>
  )
}
