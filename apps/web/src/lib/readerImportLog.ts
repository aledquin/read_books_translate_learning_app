/**
 * Import / re-blend diagnostics. Uses `console.log` (not `info`) because many browsers hide
 * "Info" in the default console filter. Also broadcasts to UI subscribers for an on-page log.
 * Filter DevTools by `reader-import` or watch the "Import activity" panel in the library.
 */
const TAG = '[reader-import]'

type ImportLogListener = (args: unknown[]) => void

const listeners = new Set<ImportLogListener>()

export function subscribeReaderImportLog(fn: ImportLogListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function logReaderImport(...args: unknown[]): void {
  try {
    console.log(TAG, ...args)
  } catch {
    /* ignore */
  }
  for (const fn of listeners) {
    try {
      fn(args)
    } catch {
      /* ignore */
    }
  }
}

export function formatImportLogArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null || a === undefined) return String(a)
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}
