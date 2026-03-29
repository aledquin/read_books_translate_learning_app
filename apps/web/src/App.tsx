import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { extractEpub } from './lib/epubExtract'
import * as db from './lib/db'
import { loadUiSettings, saveUiSettings } from './lib/settingsStorage'
import { runProgressiveBlend } from './lib/processBook'
import type { BookRecord, ReaderSettings } from './types/book'
import { publicUrl } from './lib/publicUrl'

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
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ c: number; t: number } | null>(null)
  const [selectionHint, setSelectionHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blendWarning, setBlendWarning] = useState<string | null>(null)

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

  useEffect(() => {
    if (!activeId) {
      setRecord(null)
      setLookupLex({})
      return
    }
    let cancel = false
    void (async () => {
      const r = await db.loadBook(activeId)
      if (!cancel) setRecord(r ?? null)
      try {
        const lex = await loadLexicon(ui.pairId)
        if (!cancel) setLookupLex(lex)
      } catch {
        if (!cancel) setLookupLex({})
      }
    })()
    return () => {
      cancel = true
    }
  }, [activeId, ui.pairId])

  useEffect(() => {
    if (!record || record.blendedHtml) return
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
          (c, t) => {
            if (!cancelled) setProgress({ c, t })
          },
        )
        if (cancelled) return
        const hasL2 = blended.some((h) => h.includes('lang="es"'))
        const next: BookRecord = {
          ...record,
          blendedHtml: blended,
          settingsSnapshot: loadUiSettings(),
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
  }, [record, ui.pairId, ui.paceGamma])

  const onPickFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { title, blocks } = await extractEpub(buf)
      if (blocks.length === 0) throw new Error('No readable paragraphs in this EPUB.')
      const id = crypto.randomUUID()
      const rec: BookRecord = {
        id,
        title,
        addedAt: Date.now(),
        blocks,
        blendedHtml: null,
        settingsSnapshot: loadUiSettings(),
      }
      await db.saveBook(rec)
      await refreshLibrary()
      setActiveId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
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
        <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </header>

      {error ? <p className="hint">{error}</p> : null}

      {showReader ? (
        <>
          <div className="hint" style={{ marginBottom: 8 }}>
            {record.title}
            {busy ? ` — blending ${progress?.c ?? 0}/${progress?.t ?? '…'}` : null}
          </div>
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
              Dotted underline: first time this word appears in the mixed language.
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
            English source text plus bundled EN→ES glosses. Processing runs on your device (open
            source: compromise). No LLM API.
          </p>
          <ul className="list" style={{ marginTop: 16 }}>
            {books.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => setActiveId(b.id)}>
                  <div>{b.title}</div>
                  <div className="sub">{new Date(b.addedAt).toLocaleString()}</div>
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

      {settingsOpen ? (
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false)
          }}
        >
          <div className="sheet-panel">
            <h2>Reading</h2>
            <div className="field">
              <label htmlFor="theme">Theme</label>
              <select
                id="theme"
                value={ui.theme}
                onChange={(e) =>
                  setUi((s) => ({ ...s, theme: e.target.value as ReaderSettings['theme'] }))
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
                value={ui.fontFamily}
                onChange={(e) =>
                  setUi((s) => ({
                    ...s,
                    fontFamily: e.target.value as ReaderSettings['fontFamily'],
                  }))
                }
              >
                <option value="serif">Serif</option>
                <option value="sans">Sans</option>
                <option value="readable">Readable sans</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fs">Size {ui.fontSizePx}px</label>
              <input
                id="fs"
                type="range"
                min={14}
                max={28}
                value={ui.fontSizePx}
                onChange={(e) => setUi((s) => ({ ...s, fontSizePx: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label htmlFor="lh">Line height {ui.lineHeight.toFixed(2)}</label>
              <input
                id="lh"
                type="range"
                min={130}
                max={220}
                value={Math.round(ui.lineHeight * 100)}
                onChange={(e) =>
                  setUi((s) => ({ ...s, lineHeight: Number(e.target.value) / 100 }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="pace">Blend pace (gamma) {ui.paceGamma.toFixed(2)}</label>
              <input
                id="pace"
                type="range"
                min={60}
                max={220}
                value={Math.round(ui.paceGamma * 100)}
                onChange={(e) =>
                  setUi((s) => ({ ...s, paceGamma: Number(e.target.value) / 100 }))
                }
              />
              <div className="hint">Higher = slower introduction of Spanish tokens.</div>
            </div>
            <button type="button" className="btn" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}




