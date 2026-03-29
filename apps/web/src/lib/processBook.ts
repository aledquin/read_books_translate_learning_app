import type { ProcessMessage } from '../workers/progressive.worker'

type WorkerOutMsg =
  | { type: 'progress'; id: number; current: number; total: number }
  | { type: 'result'; id: number; blendedHtml: string[] }
  | { type: 'error'; id: number; message: string }

let seq = 1

export function runProgressiveBlend(
  htmlBlocks: string[],
  plainBlocks: string[],
  lexicon: Record<string, string>,
  paceGamma: number,
  maxLearnWords: number,
  onProgress: (current: number, total: number) => void,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/progressive.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const id = seq++
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as WorkerOutMsg
      if (d.id !== id) return
      if (d.type === 'progress') {
        onProgress(d.current, d.total)
        return
      }
      worker.removeEventListener('message', onMsg)
      worker.terminate()
      if (d.type === 'result') resolve(d.blendedHtml)
      else reject(new Error(d.message))
    }
    worker.addEventListener('message', onMsg)
    const msg: ProcessMessage = {
      type: 'process',
      id,
      htmlBlocks,
      plainBlocks,
      lexicon,
      paceGamma,
      maxLearnWords,
    }
    worker.postMessage(msg)
  })
}
