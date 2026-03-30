import type { ReaderSettings } from '../types/book'

type Props = {
  draft: ReaderSettings
  onChange: (next: ReaderSettings) => void
  onApply: () => void
  onCancel: () => void
}

export function SettingsSheet({ draft, onChange, onApply, onCancel }: Props) {
  const patch = (partial: Partial<ReaderSettings>) => {
    onChange({ ...draft, ...partial })
  }

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
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
            value={draft.theme}
            onChange={(e) =>
              patch({ theme: e.target.value as ReaderSettings['theme'] })
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
            value={draft.fontFamily}
            onChange={(e) =>
              patch({
                fontFamily: e.target.value as ReaderSettings['fontFamily'],
              })
            }
          >
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
            <option value="readable">Readable sans</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="fs">Size {draft.fontSizePx}px</label>
          <input
            id="fs"
            type="range"
            min={14}
            max={28}
            value={draft.fontSizePx}
            onChange={(e) => patch({ fontSizePx: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="lh">Line height {draft.lineHeight.toFixed(2)}</label>
          <input
            id="lh"
            type="range"
            min={130}
            max={220}
            value={Math.round(draft.lineHeight * 100)}
            onChange={(e) =>
              patch({ lineHeight: Number(e.target.value) / 100 })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="pace">Blend pace (gamma) {draft.paceGamma.toFixed(2)}</label>
          <input
            id="pace"
            type="range"
            min={60}
            max={220}
            value={Math.round(draft.paceGamma * 100)}
            onChange={(e) =>
              patch({ paceGamma: Number(e.target.value) / 100 })
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
            value={draft.learnWordCap}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!Number.isFinite(n)) return
              patch({ learnWordCap: Math.max(1, Math.min(5000, n)) })
            }}
          />
          <div className="hint">
            Only this many distinct words (by priority) can appear as Spanish. Apply saves settings
            and re-blends open books when mix options changed.
          </div>
        </div>

        {draft.pairId === 'en-es' ? (
          <>
            <div className="field field-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={draft.sentenceTranslateEnabled}
                  onChange={(e) => patch({ sentenceTranslateEnabled: e.target.checked })}
                />{' '}
                Sentence translation (EN→ES)
              </label>
              <div className="hint">
                Word-by-word mixing always runs from the lexicon. This adds full-sentence Spanish
                via the network (replace in place and/or tap to load). Off by default. Requires
                internet. At import you can select a Spanish EPUB together with the English one (same
                paragraph order) so full sentences use that file and skip APIs where blocks align.
                Otherwise the default provider (MyMemory) has a small free daily quota; when it is
                exhausted the app tries LibreTranslate, which is also often busy. For reliable use,
                add Google Cloud Translation in <code>apps/web/.env</code> (
                <code>GOOGLE_TRANSLATE_API_KEY</code> +{' '}
                <code>VITE_GOOGLE_TRANSLATE_USE_DEV_PROXY=true</code> in dev), then restart{' '}
                <code>npm run dev</code>.
              </div>
            </div>
            <div className="field">
              <span className="field-label" id="sent-style-label">
                How full sentences appear
              </span>
              <div className="field-radio-group" role="group" aria-labelledby="sent-style-label">
                <label>
                  <input
                    type="radio"
                    name="sentenceTranslateStyle"
                    checked={draft.sentenceTranslateStyle === 'replace_paragraph'}
                    disabled={!draft.sentenceTranslateEnabled}
                    onChange={() => patch({ sentenceTranslateStyle: 'replace_paragraph' })}
                  />{' '}
                  Replace whole paragraph (one Spanish block per English paragraph; paces API calls)
                </label>
                <label>
                  <input
                    type="radio"
                    name="sentenceTranslateStyle"
                    checked={draft.sentenceTranslateStyle === 'replace_sentence'}
                    disabled={!draft.sentenceTranslateEnabled}
                    onChange={() => patch({ sentenceTranslateStyle: 'replace_sentence' })}
                  />{' '}
                  Replace sentence by sentence (splits on . ? ! … ; more API calls. With a paired
                  Spanish EPUB, EN/ES must split into the same number of sentences or we fall back
                  to one paragraph of Spanish)
                </label>
                <label>
                  <input
                    type="radio"
                    name="sentenceTranslateStyle"
                    checked={draft.sentenceTranslateStyle === 'tap_to_reveal'}
                    disabled={!draft.sentenceTranslateEnabled}
                    onChange={() => patch({ sentenceTranslateStyle: 'tap_to_reveal' })}
                  />{' '}
                  Tap to show Spanish (loads under each paragraph when you tap; from the start of
                  the book)
                </label>
              </div>
            </div>
            <div className="field">
              <span className="field-label" id="sent-when-label">
                When to replace (replace paragraph / replace sentence only)
              </span>
              <div className="field-radio-group" role="group" aria-labelledby="sent-when-label">
                <label>
                  <input
                    type="radio"
                    name="sentenceTranslateWhen"
                    checked={draft.sentenceTranslateWhen === 'from_beginning'}
                    disabled={
                      !draft.sentenceTranslateEnabled ||
                      draft.sentenceTranslateStyle === 'tap_to_reveal'
                    }
                    onChange={() => patch({ sentenceTranslateWhen: 'from_beginning' })}
                  />{' '}
                  From the beginning of the book
                </label>
                <label>
                  <input
                    type="radio"
                    name="sentenceTranslateWhen"
                    checked={draft.sentenceTranslateWhen === 'after_lexicon_sightings'}
                    disabled={
                      !draft.sentenceTranslateEnabled ||
                      draft.sentenceTranslateStyle === 'tap_to_reveal'
                    }
                    onChange={() => patch({ sentenceTranslateWhen: 'after_lexicon_sightings' })}
                  />{' '}
                  After lexicon word sightings
                </label>
              </div>
            </div>
            <div className="field">
              <label htmlFor="sent-after">Lexicon sightings before replace (replace modes)</label>
              <input
                id="sent-after"
                type="number"
                min={1}
                max={5000}
                step={1}
                value={draft.sentenceTranslateAfterSightings}
                disabled={
                  !draft.sentenceTranslateEnabled ||
                  draft.sentenceTranslateStyle === 'tap_to_reveal' ||
                  draft.sentenceTranslateWhen !== 'after_lexicon_sightings'
                }
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (!Number.isFinite(n)) return
                  patch({
                    sentenceTranslateAfterSightings: Math.max(1, Math.min(5000, n)),
                  })
                }}
              />
              <div className="hint">
                Counts each word that appears in your lexicon (reading order; repeats count). Used
                only when using replace mode and “after lexicon sightings”. Blocks that already have
                bundled Spanish from a paired EPUB are still replaced from the start; the threshold
                only delays API translation for blocks without companion text.
              </div>
            </div>
          </>
        ) : (
          <p className="hint">
            Sentence translation is only available for the EN→ES pair (current pair:{' '}
            {draft.pairId}).
          </p>
        )}

        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
