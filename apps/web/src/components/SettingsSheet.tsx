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
