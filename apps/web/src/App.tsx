import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReaderView } from './components/ReaderView'
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
  sentenceTranslationIssueMessage,
  type BlendPhase,
} from './lib/buildBlendedOutput'
import { CURRENT_BLEND_VERSION } from './lib/blendVersion'
import {
  attachSpanishCompanionBlocks,
  bookHasBundledSentenceEs,
  orderEpubFilesEnglishFirst,
} from './lib/epubCompanion'
import { extractEpub } from './lib/epubExtract'
import { getReplacementWordList } from './lib/progressiveBlendCore'
import { applyTheme } from './lib/readerUi'
import {
  formatImportLogArgs,
  logReaderImport,
  subscribeReaderImportLog,
} from './lib/readerImportLog'
import { loadUiSettings, saveUiSettings } from './lib/settingsStorage'
import type { BookRecord, ReaderSettings, ReadingCheckpoint } from './types/book'

type TapTranslationEntry =
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'error'; message: string }

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
  const [error, setError] = useState<string | null>(null)
  const [blendWarning, setBlendWarning] = useState<string | null>(null)
  const [myMemoryQuotaNotice, setMyMemoryQuotaNotice] = useState<string | null>(null)
  const [companionImportNotice, setCompanionImportNotice] = useState<string | null>(null)
  /** Shown during import / re-blend so users see what the app is doing (also see DevTools console in dev). */
  const [workStatusLine, setWorkStatusLine] = useState<string | null>(null)
  /** Optional Spanish EPUB chosen first; English import button merges and clears this. */
  const [stagedCompanionEpub, setStagedCompanionEpub] = useState<File | null>(null)
  /** On-page copy of import/re-blend logs (console alone is easy to miss). */
  const [importActivityLines, setImportActivityLines] = useState<string[]>([])
  const quotaAlertOncePerBlendRef = useRef(false)
  const recordRef = useRef<BookRecord | null>(null)
  recordRef.current = record

  const persistCheckpoint = useCallback(
    (cp: ReadingCheckpoint) => {
      if (!ui.readingCheckpointEnabled) return
      const r = recordRef.current
      if (!r) return
      const next = { ...r, readingCheckpoint: cp }
      setRecord(next)
      void db.saveBook(next)
    },
    [ui.readingCheckpointEnabled],
  )

  const appendImportActivityLine = useCallback((args: unknown[]) => {
    setImportActivityLines((prev) => {
      const ts = new Date().toLocaleTimeString()
      const line = `${ts}  ${formatImportLogArgs(args)}`
      return [...prev, line].slice(-80)
    })
  }, [])

  useEffect(() => subscribeReaderImportLog(appendImportActivityLine), [appendImportActivityLine])

  const notifyMyMemoryQuotaBlend = useCallback((message: string) => {
    setMyMemoryQuotaNotice(message)
    if (!quotaAlertOncePerBlendRef.current) {
      quotaAlertOncePerBlendRef.current = true
      window.alert(`MyMemory free quota or rate limit\n\n${message}`)
    }
  }, [])
  const [tapTranslationByIndex, setTapTranslationByIndex] = useState<
    Record<number, TapTranslationEntry>
  >({})
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
    setTapTranslationByIndex({})
  }, [activeId])

  useEffect(() => {
    if (!activeId) {
      setRecord(null)
      setLookupLex({})
      setBlendWarning(null)
      setMyMemoryQuotaNotice(null)
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
      logReaderImport('Re-blend started (settings differ from last saved blend)', {
        bookId: record.id,
        title: record.title,
        blocks: record.blocks.length,
      })
      setBusy(true)
      setProgress({ phase: 'blend', c: 0, t: record.blocks.length })
      setError(null)
      setBlendWarning(null)
      quotaAlertOncePerBlendRef.current = false
      setMyMemoryQuotaNotice(null)
      try {
        setWorkStatusLine('Re-blend: loading lexicon…')
        const lex = await loadLexicon(ui.pairId)
        if (cancelled) return
        assertLexiconNonEmpty(lex)
        logReaderImport('Re-blend: lexicon ready', Object.keys(lex).length, 'entries')

        setWorkStatusLine('Re-blend: word-level mix, then optional full sentences…')
        let reblendLoggedPhase: BlendPhase | null = null
        const blended = await buildBlendedHtmlPipeline(
          record.blocks,
          lex,
          ui,
          (phase, c, t) => {
            if (!cancelled) {
              setProgress({ phase, c, t })
              if (phase !== reblendLoggedPhase) {
                reblendLoggedPhase = phase
                logReaderImport(`Re-blend phase → ${phase}`, { step: `${c}/${t}` })
              } else if (phase === 'sentence' && t > 0 && (c === 1 || c === t || c % 5 === 0)) {
                logReaderImport('Re-blend sentence progress', `${c}/${t}`)
              }
              if (phase === 'sentence') {
                setWorkStatusLine(
                  `Re-blend: full-sentence Spanish (${c}/${t} paragraphs in this phase)…`,
                )
              }
            }
          },
          { onMyMemoryQuotaLimited: notifyMyMemoryQuotaBlend },
        )
        if (cancelled) return

        logReaderImport('Re-blend finished', { outputParagraphs: blended.length })
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
        } else {
          setBlendWarning(null)
        }
      } catch (e) {
        if (!cancelled) {
          logReaderImport('Re-blend failed', e instanceof Error ? e.message : String(e), e)
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) {
          setBusy(false)
          setProgress(null)
          setWorkStatusLine(null)
          logReaderImport('Re-blend handler finished (UI unlocked)')
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
    ui.sentenceTranslateAfterSightings,
    ui.sentenceTranslateWhen,
    ui.sentenceTranslateStyle,
    notifyMyMemoryQuotaBlend,
  ])

  const onPickEpubFiles = async (files: File[]) => {
    const ordered = orderEpubFilesEnglishFirst(files)
    const enFile = ordered[0]
    if (!enFile) {
      logReaderImport('Import aborted: no English file in selection')
      return
    }
    logReaderImport('——— New import ———')
    logReaderImport('Import started', {
      files: ordered.map((f) => f.name),
      sentenceTranslateEnabled: ui.sentenceTranslateEnabled,
      sentenceStyle: ui.sentenceTranslateStyle,
    })
    setError(null)
    setBlendWarning(null)
    setCompanionImportNotice(null)
    quotaAlertOncePerBlendRef.current = false
    setMyMemoryQuotaNotice(null)
    setBusy(true)
    setProgress({ phase: 'blend', c: 0, t: 1 })
    const id = crypto.randomUUID()
    let title = enFile.name.replace(/\.epub$/i, '')
    let blocks: BookRecord['blocks'] = []
    try {
      if (ordered.length === 2) {
        logReaderImport('Using two EPUBs (after English-first sort)', {
          english: ordered[0]?.name,
          spanish: ordered[1]?.name,
        })
      }

      setWorkStatusLine('Reading English EPUB (unpacking spine and paragraphs)…')
      const buf = await enFile.arrayBuffer()
      logReaderImport('English file read into memory', `${buf.byteLength} bytes`)
      const extracted = await extractEpub(buf)
      logReaderImport('English EPUB parsed', {
        title: extracted.title,
        paragraphBlocks: extracted.blocks.length,
      })
      if (extracted.blocks.length === 0) {
        throw new Error('No readable paragraphs in this EPUB.')
      }
      title = extracted.title
      blocks = extracted.blocks

      const esFile = ordered[1]
      if (esFile) {
        setWorkStatusLine(
          `English: ${blocks.length} paragraphs. Reading Spanish companion: ${esFile.name}…`,
        )
        const esBuf = await esFile.arrayBuffer()
        logReaderImport('Spanish file read into memory', `${esBuf.byteLength} bytes`)
        const esExtracted = await extractEpub(esBuf)
        logReaderImport('Spanish EPUB parsed', {
          title: esExtracted.title,
          paragraphBlocks: esExtracted.blocks.length,
        })
        const {
          blocks: merged,
          mismatchWarning,
          linkedParagraphCount,
        } = attachSpanishCompanionBlocks(blocks, esExtracted.blocks)
        blocks = merged
        logReaderImport('Companion pairing done', {
          linkedParagraphCount,
          mismatchWarning: mismatchWarning ?? null,
        })
        if (linkedParagraphCount > 0) {
          setCompanionImportNotice(
            (mismatchWarning ? `${mismatchWarning} ` : '') +
              `Bundled Spanish linked: ${linkedParagraphCount} paragraphs. ` +
              'Enable Settings → Sentence translation (EN→ES) and choose Replace or Tap mode to use that text. ' +
              'If sentence translation stays off, you only get lexicon word mixing—the companion EPUB is ignored for display.',
          )
        } else if (esExtracted.blocks.length > 0) {
          setCompanionImportNotice(
            (mismatchWarning ? `${mismatchWarning} ` : '') +
              'Spanish file was read but no non-empty paragraphs could be paired (structure may differ from English). ' +
              'Compare block counts in DevTools logs: [extractEpub] and [epubCompanion].',
          )
        } else if (mismatchWarning) {
          setCompanionImportNotice(mismatchWarning)
        }
      } else {
        setWorkStatusLine(`English only: ${blocks.length} paragraphs. Loading lexicon…`)
        logReaderImport('No companion file — English only')
      }

      setProgress({ phase: 'blend', c: 0, t: blocks.length })

      setWorkStatusLine('Loading lexicon…')
      const lex = await loadLexicon(ui.pairId)
      assertLexiconNonEmpty(lex)
      logReaderImport('Lexicon loaded', {
        pairId: ui.pairId,
        entries: Object.keys(lex).length,
      })

      setWorkStatusLine('Blending (word-level Spanish from lexicon, then optional full sentences)…')
      let lastLoggedPhase: BlendPhase | null = null
      const blended = await buildBlendedHtmlPipeline(
        blocks,
        lex,
        ui,
        (phase, c, t) => {
          setProgress({ phase, c, t })
          if (phase !== lastLoggedPhase) {
            lastLoggedPhase = phase
            logReaderImport(`Pipeline phase → ${phase}`, { step: `${c}/${t}` })
          } else if (phase === 'sentence' && t > 0 && (c === 1 || c === t || c % 5 === 0)) {
            logReaderImport('Sentence replacement progress', `${c}/${t}`)
          }
          if (phase === 'sentence') {
            setWorkStatusLine(`Full-sentence Spanish phase: ${c}/${t} paragraphs…`)
          }
        },
        { onMyMemoryQuotaLimited: notifyMyMemoryQuotaBlend },
      )
      logReaderImport('Blend pipeline finished', {
        outputParagraphs: blended.length,
        sentenceTranslateEnabled: ui.sentenceTranslateEnabled,
      })

      const rec: BookRecord = {
        id,
        title,
        addedAt: Date.now(),
        blocks,
        blendedHtml: blended,
        blendVersion: CURRENT_BLEND_VERSION,
        settingsSnapshot: snapshotForBook(ui),
      }
      setWorkStatusLine('Saving book to your device…')
      await db.saveBook(rec)
      await refreshLibrary()
      setBlendWarning(
        !blendedOutputHasL2(blended) && blended.length > 0 ? NO_L2_BLEND_WARNING : null,
      )
      setActiveId(id)
      logReaderImport('Import complete — book opened', { title, id })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logReaderImport('Import failed', message, e)
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
      setStagedCompanionEpub(null)
      setBusy(false)
      setProgress(null)
      setWorkStatusLine(null)
      logReaderImport('Import handler finished (UI unlocked)')
    }
  }

  const showReader = Boolean(activeId && record)
  const readerHtmls =
    showReader && record
      ? (record.blendedHtml ?? record.blocks.map((b) => b.html))
      : []

  const showTapSentenceUi =
    Boolean(showReader) &&
    ui.sentenceTranslateEnabled &&
    ui.pairId === 'en-es' &&
    ui.sentenceTranslateStyle === 'tap_to_reveal'

  const sentenceReplaceInPlace =
    ui.sentenceTranslateStyle === 'replace_paragraph' ||
    ui.sentenceTranslateStyle === 'replace_sentence'

  const replacementRows = useMemo(() => {
    if (!record || Object.keys(lookupLex).length === 0) return []
    return getReplacementWordList(
      record.blocks.map((b) => b.plain),
      lookupLex,
      ui.learnWordCap,
    )
  }, [record, lookupLex, ui.learnWordCap])

  const sentenceHint = useMemo(() => {
    if (!record?.blendedHtml?.length) return null
    if (Object.keys(lookupLex).length === 0) return null
    return sentenceTranslationIssueMessage(
      ui,
      record.blocks.map((b) => b.plain),
      lookupLex,
      record.blendedHtml,
    )
  }, [
    record,
    lookupLex,
    ui.sentenceTranslateEnabled,
    ui.pairId,
    ui.sentenceTranslateAfterSightings,
    ui.sentenceTranslateWhen,
    ui.sentenceTranslateStyle,
  ])

  useEffect(() => {
    setTapTranslationByIndex({})
  }, [ui.sentenceTranslateEnabled, ui.sentenceTranslateStyle])

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
      {companionImportNotice ? (
        <p className="hint blend-warning" role="status">
          {companionImportNotice}
        </p>
      ) : null}
      {blendWarning ? <p className="hint blend-warning">{blendWarning}</p> : null}
      {myMemoryQuotaNotice ? (
        <p className="hint blend-warning" role="alert">
          <strong>MyMemory quota:</strong> {myMemoryQuotaNotice}
        </p>
      ) : null}
      {sentenceHint ? <p className="hint blend-warning">{sentenceHint}</p> : null}

      {busy && !showReader ? (
        <div className="import-progress">
          <p className="hint">
            {progress?.phase === 'sentence'
              ? 'Applying full-sentence Spanish (bundled EPUB text and/or translation API)…'
              : 'Extracting and blending…'}
          </p>
          {workStatusLine ? (
            <p className="hint import-status-detail" role="status" aria-live="polite">
              {workStatusLine}
            </p>
          ) : null}
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
              {busy && workStatusLine ? (
                <>
                  <br />
                  <span className="reader-work-status">{workStatusLine}</span>
                </>
              ) : null}
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
              <ReaderView
                key={record.id}
                record={record}
                ui={ui}
                readerHtmls={readerHtmls}
                lookupLex={lookupLex}
                busy={busy}
                progress={progress}
                showTapSentenceUi={showTapSentenceUi}
                sentenceReplaceInPlace={sentenceReplaceInPlace}
                bookHasBundledSentenceEs={bookHasBundledSentenceEs(record.blocks)}
                tapTranslationByIndex={tapTranslationByIndex}
                setTapTranslationByIndex={setTapTranslationByIndex}
                onPersistCheckpoint={persistCheckpoint}
                onMyMemoryQuota={(msg) => {
                  setMyMemoryQuotaNotice(msg)
                }}
              />
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
          <div className="library-import-row">
            <label className="btn file-label file-label-secondary">
              <input
                type="file"
                accept=".epub,application/epub+zip"
                disabled={busy}
                onChange={(e) => {
                  const input = e.currentTarget
                  // FileList is live — snapshot before clearing value or it becomes empty.
                  const snapshot = input.files ? Array.from(input.files) : []
                  const f = snapshot[0] ?? null
                  input.value = ''
                  setCompanionImportNotice(null)
                  setStagedCompanionEpub(f)
                  logReaderImport('(picker) Spanish companion', f ? `staged: ${f.name}` : 'cleared')
                }}
              />
              Spanish EPUB (optional)
            </label>
            {stagedCompanionEpub ? (
              <div className="hint library-staged">
                Staged companion: <strong>{stagedCompanionEpub.name}</strong>
                <button
                  type="button"
                  className="btn-link library-staged-clear"
                  disabled={busy}
                  onClick={() => setStagedCompanionEpub(null)}
                >
                  Clear
                </button>
              </div>
            ) : (
              <p className="hint library-staged-placeholder">
                Optional: choose the Spanish edition first, then import English below (correct order
                guaranteed). Or use one multi-select: names like <code>*.es.epub</code> are sorted so
                English is read first.
              </p>
            )}
          </div>
          <label className="btn file-label">
            <input
              type="file"
              accept=".epub,application/epub+zip"
              multiple
              disabled={busy}
              onChange={(e) => {
                const input = e.currentTarget
                // FileList is live — clearing `value` empties it immediately; copy Files first.
                const picked = input.files ? Array.from(input.files).slice(0, 2) : []
                input.value = ''
                logReaderImport('(picker) English EPUB dialog closed', {
                  selectedCount: picked.length,
                  names: picked.map((x) => x.name),
                })
                if (picked.length === 0) {
                  logReaderImport(
                    '(picker) No file returned — if you did not cancel, try again (browser quirk).',
                  )
                  return
                }
                const merged =
                  picked.length >= 2
                    ? orderEpubFilesEnglishFirst(picked)
                    : stagedCompanionEpub
                      ? orderEpubFilesEnglishFirst([picked[0]!, stagedCompanionEpub])
                      : picked
                logReaderImport('(picker) Starting import with files', merged.map((x) => x.name))
                void onPickEpubFiles(merged)
              }}
            />
            Import English EPUB
          </label>
          <p className="hint">
            English source + bundled lexicon glosses. If you staged a Spanish file, it is merged by
            paragraph order. Full-sentence modes (Settings) use bundled Spanish and skip APIs for
            matching blocks. Import steps also appear below and in the browser console as{' '}
            <code>[reader-import]</code> (open DevTools → Console; enable <strong>Verbose</strong> if
            you do not see <code>console.log</code> lines).
          </p>
          <details className="import-activity" open>
            <summary>Import activity (on-page log)</summary>
            <pre className="import-activity-pre" role="log" aria-live="polite">
              {importActivityLines.length > 0
                ? importActivityLines.join('\n')
                : 'Pick a file above — lines appear here and in the console as [reader-import].'}
            </pre>
            <button
              type="button"
              className="btn-link import-activity-clear"
              onClick={() => setImportActivityLines([])}
            >
              Clear on-page log
            </button>
          </details>
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
