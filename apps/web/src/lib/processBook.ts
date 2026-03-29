import type { ProcessMessage } from '../workers/progressive.worker'

let seq = 1

export function runProgressiveBlend(
  htmlBlocks: string[],
  plainBlocks: string[],
  lexicon: Record<string, string>,
  paceGamma: number,
  onProgress: (current: number, total: number) => void,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/progressive.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const id = seq++
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as
        | { type: 'progress'; id: number; current: number; total: number }
        | { type: 'result'; id: number; blendedHtml: string[] }
        | { type: 'error'; id: number; message: string }
      if (d.id !== id) return
      if (d.type === 'progress') onProgress(d.current, d.total)
      if (d.type === 'result') {
        worker.removeEventListener('message', onMsg)
        worker.terminate()
        resolve(d.blendedHtml)
      }
      if (d.type === 'error') {
        worker.removeEventListener('message', onMsg)
        worker.terminate()
        reject(new Error(d.message))
      }
    }
    worker.addEventListener('message', onMsg)
    const msg: ProcessMessage = {
      type: 'process',
      id,
      htmlBlocks,
      plainBlocks,
      lexicon,
      paceGamma,
    }
    worker.postMessage(msg)
  })
}
