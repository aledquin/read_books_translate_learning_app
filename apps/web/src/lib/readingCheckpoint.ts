import type { ReadingCheckpoint } from '../types/book'

/** First block whose bottom is below a band from the top of the viewport (inside `scrollEl`). */
export function findAnchorBlockGlobalIndex(scrollEl: HTMLElement): number | undefined {
  const cr = scrollEl.getBoundingClientRect()
  const bandTop = cr.top + Math.min(100, cr.height * 0.12)
  const nodes = scrollEl.querySelectorAll('[data-pr-block-global]')
  for (const node of nodes) {
    const br = node.getBoundingClientRect()
    if (br.bottom > bandTop) {
      const g = node.getAttribute('data-pr-block-global')
      const n = g ? parseInt(g, 10) : NaN
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

export function buildCheckpoint(scrollEl: HTMLElement): ReadingCheckpoint {
  return {
    scrollTop: scrollEl.scrollTop,
    anchorBlockGlobalIndex: findAnchorBlockGlobalIndex(scrollEl),
    savedAt: Date.now(),
  }
}

export function scrollContainerToCheckpoint(
  scrollEl: HTMLElement,
  cp: ReadingCheckpoint | undefined,
): void {
  if (!cp || cp.scrollTop <= 0) return
  const max = scrollEl.scrollHeight - scrollEl.clientHeight
  const y = max > 0 ? Math.min(cp.scrollTop, Math.max(0, max)) : 0
  scrollEl.scrollTop = y
  if (y === 0 && cp.anchorBlockGlobalIndex != null) {
    const el = scrollEl.querySelector(`[data-pr-block-global="${cp.anchorBlockGlobalIndex}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
}
