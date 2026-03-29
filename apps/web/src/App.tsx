import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { extractEpub } from './lib/epubExtract'
import * as db from './lib/db'
import { loadUiSettings, saveUiSettings } from './lib/settingsStorage'
import { runProgressiveBlend } from './lib/processBook'
import type { BookRecord, ReaderSettings } from './types/book'
import { CURRENT_BLEND_VERSION } from './lib/blendVersion'
import { publicUrl } from './lib/publicUrl'
import { getReplacementWordList } from './lib/progressiveBlendCore'

function blendSettingsMatch(rec: BookRecord, ui: ReaderSettings): boolean {
  const snap = rec.settingsSnapshot
  const snapCap = snap.learnWordCap ?? 100
  return (
    snap.pairId === ui.pairId &&
    snap.paceGamma === ui.paceGamma &&
    snapCap === ui.learnWordCap
  )
}

function snapshotForBook(ui: ReaderSettings): ReaderSettings {
  return { ...ui }
}

async function loadLexicon(pairId: string): Promise<Record<string, string>> {
  const res = await fetch(publicUrl(`lexicons/${pairId}.json`))
  if (!res.ok)
    throw new Error(
      `Missing lexicon (${res.status}): ${publicUrl(`lexicons/${pairId}.json`)}`,
    )
  return (await res.json()) as Record<string, string>
}

function applyTheme(theme: ReaderSettings['theme']) {
  document.documentElement.dataset.theme = theme
}

function fontClass(f: ReaderSettings['fontFamily']) {
  if (f === 'sans') return 'font-sans'
  if (f === 'readable') return 'font-readable'
  return 'font-serif'
}

export default function App() {
  const [ui, setUi] = useState<ReaderSettings>(() => loadUiSettings())
  const [books, setBooks] = useState<Awaited<ReturnType<typeof db.listBooks>>>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [record, setRecord] = useState<BookRecord | null>(null)
  const [lookupLex, setLookupLex] = useState<Record<string, string>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftUi, setDraftUi] = useState<ReaderSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
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
      if (
        r?.blendedHtml &&
        r.blendVersion !== CURRENT_BLEND_VERSION
      ) {
        r = { ...r, blendedHtml: null }
      }
      if (!cancel) setRecord(r ?? null)
      try {
        const lex = await loadLexicon(ui.pairId)
        if (!cancel) setLookupLex(lex)
      } catch (e) {
        if (!cancel) {
          setLookupLex({})
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load lexicon (check URL base for GitHub Pages).',
          )
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [activeId, ui.pairId])

  useEffect(() => {
    if (!record) return
    const blendUpToDate =
      !!record.blendedHtml &&
      record.blendedHtml.length === record.blocks.length &&
      record.blendVersion === CURRENT_BLEND_VERSION &&
      blendSettingsMatch(record, ui)
    if (blendUpToDate) return
    let cancelled = false
    void (async () => {
      setBusy(true)
      setProgress({ c: 0, t: record.blocks.length })
      setError(null)
      setBlendWarning(null)
      try {
        const lex = await loadLexicon(ui.pairId)
        if (cancelled) return
        const keys = Object.keys(lex).length
        if (keys === 0) {
          throw new Error('Lexicon is empty — check lexicon JSON and deploy path.')
        }
        const blended = await runProgressiveBlend(
          record.blocks.map((b) => b.html),
          record.blocks.map((b) => b.plain),
          lex,
          ui.paceGamma,
          ui.learnWordCap,
          (c, t) => {
            if (!cancelled) setProgress({ c, t })
          },
        )
        if (cancelled) return
        const hasL2 = blended.some((h) => h.includes('lang="es"'))
        const next: BookRecord = {
          ...record,
          blendedHtml: blended,
          blendVersion: CURRENT_BLEND_VERSION,
          settingsSnapshot: snapshotForBook(ui),
        }
        await db.saveBook(next)
        setRecord(next)
        if (!hasL2 && blended.length > 0) {
          setBlendWarning(
            'No Spanish replacements were made: this book may not use words from the bundled lexicon (English lemmas in public/lexicons/en-es.json). Try another title or add words to the lexicon.',
          )
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
  }, [record, ui.pairId, ui.paceGamma, ui.learnWordCap])

  const onPickFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    setBlendWarning(null)
    setBusy(true)
    setProgress({ c: 0, t: 1 })
    const id = crypto.randomUUID()
    let title = file.name.replace(/\.epub$/i, '')
    let blocks: BookRecord['blocks'] = []
    try {
      const buf = await file.arrayBuffer()
      const extracted = await extractEpub(buf)
      if (extracted.blocks.length === 0)
        throw new Error('No readable paragraphs in this EPUB.')
      title = extracted.title
      blocks = extracted.blocks
      setProgress({ c: 0, t: blocks.length })

      const lex = await loadLexicon(ui.pairId)
      const keys = Object.keys(lex).length
      if (keys === 0) {
        throw new Error('Lexicon is empty — check lexicon JSON and deploy path.')
      }

      const blended = await runProgressiveBlend(
        blocks.map((b) => b.html),
        blocks.map((b) => b.plain),
        lex,
        ui.paceGamma,
        ui.learnWordCap,
        (c, t) => {
          setProgress({ c, t })
        },
      )

      const hasL2 = blended.some((h) => h.includes('lang="es"'))
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
        !hasL2 && blended.length > 0
          ? 'No Spanish replacements were made: this book may not use words from the bundled lexicon (English lemmas in public/lexicons/en-es.json). Try another title or add words to the lexicon.'
          : null,
      )
      setActiveId(id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      if (blocks.length > 0) {
        const fallback: BookRecord = {
          id,
          title,
          addedAt: Date.now(),
          blocks,
          blendedHtml: null,
          settingsSnapshot: snapshotForBook(ui),
        }
        await db.saveBook(fallback)
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

  const showReader = activeId && record
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
      (r) =>
        r.en.toLowerCase().includes(q) || r.es.toLowerCase().includes(q),
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
          <p className="hint">Extracting and blending…</p>
          {progress ? (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div
                  style={{
                    width: `${Math.min(100, (100 * progress.c) / Math.max(1, progress.t))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showReader ? (
        <>
          <div className="reader-title-row">
            <div className="hint reader-title-hint">
              {record.title}
              {busy ? ` — blending ${progress?.c ?? 0}/${progress?.t ?? '…'}` : null}
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
              {busy && !record.blendedHtml ? (
                <div className="progress-wrap">
                  <div className="progress-bar">
                    <div
                      style={{
                        width: `${progress ? Math.min(100, (100 * progress.c) / Math.max(1, progress.t)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {record.blendedHtml ? (
                <p className="hint pr-legend">
                  Dotted underline: first time that word appears in Spanish. Later in the book, more
                  of each paragraph shifts to Spanish; the last sections use your full word list.
                </p>
              ) : null}
              <article
                className={`reader-scroll ${fontClass(ui.fontFamily)}`}
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
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancelSettings()
          }}
        >
          <div className="sheet-panel">
            <h2 id="settings-title">Reading</h2>
            <p className="hint sheet-hint">
              Changes apply when you tap Apply. Escape or the backdrop cancels.
            </p>
            <div className="field">
              <label htmlFor="theme">Theme</label>
              <select
                id="theme"
                value={draftUi.theme}
                onChange={(e) =>
                  setDraftUi((s) =>
                    s
                      ? { ...s, theme: e.target.value as ReaderSettings['theme'] }
                      : s,
                  )
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="sepia">Sepia</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="font">Font</label>
              <select
                id="font"
                value={draftUi.fontFamily}
                onChange={(e) =>
                  setDraftUi((s) =>
                    s
                      ? {
                          ...s,
                          fontFamily: e.target.value as ReaderSettings['fontFamily'],
                        }
                      : s,
                  )
                }
              >
                <option value="serif">Serif</option>
                <option value="sans">Sans</option>
                <option value="readable">Readable sans</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fs">Size {draftUi.fontSizePx}px</label>
              <input
                id="fs"
                type="range"
                min={14}
                max={28}
                value={draftUi.fontSizePx}
                onChange={(e) =>
                  setDraftUi((s) =>
                    s ? { ...s, fontSizePx: Number(e.target.value) } : s,
                  )
                }
              />
            </div>
            <div className="field">
              <label htmlFor="lh">Line height {draftUi.lineHeight.toFixed(2)}</label>
              <input
                id="lh"
                type="range"
                min={130}
                max={220}
                value={Math.round(draftUi.lineHeight * 100)}
                onChange={(e) =>
                  setDraftUi((s) =>
                    s ? { ...s, lineHeight: Number(e.target.value) / 100 } : s,
                  )
                }
              />
            </div>
            <div className="field">
              <label htmlFor="pace">Blend pace (gamma) {draftUi.paceGamma.toFixed(2)}</label>
              <input
                id="pace"
                type="range"
                min={60}
                max={220}
                value={Math.round(draftUi.paceGamma * 100)}
                onChange={(e) =>
                  setDraftUi((s) =>
                    s ? { ...s, paceGamma: Number(e.target.value) / 100 } : s,
                  )
                }
              />
              <div className="hint">Higher = slower introduction of Spanish tokens.</div>
            </div>
            <div className="field">
              <label htmlFor="learn-cap">Words to learn (max lemmas)</label>
              <input
                id="learn-cap"
                type="number"
                min={1}
                max={5000}
                step={1}
                value={draftUi.learnWordCap}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (!Number.isFinite(n)) return
                  setDraftUi((s) =>
                    s
                      ? {
                          ...s,
                          learnWordCap: Math.max(1, Math.min(5000, n)),
                        }
                      : s,
                  )
                }}
              />
              <div className="hint">
                Only this many distinct words (by priority) can appear as Spanish. Apply saves
                settings and re-blends open books when mix options changed.
              </div>
            </div>
            <div className="sheet-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelSettings}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={applySettings}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}




