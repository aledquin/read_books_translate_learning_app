/// <reference lib="webworker" />

import {
  blendProgressiveHtml,
  type ProgressiveBlendParams,
} from '../lib/progressiveBlendCore'

export type ProcessMessage = {
  type: 'process'
  id: number
} & ProgressiveBlendParams

type OutMsg =
  | { type: 'progress'; id: number; current: number; total: number }
  | { type: 'result'; id: number; blendedHtml: string[] }
  | { type: 'error'; id: number; message: string }

self.onmessage = (ev: MessageEvent<ProcessMessage>) => {
  const msg = ev.data
  if (msg.type !== 'process') return
  try {
    const { id, ...params } = msg
    const blendedHtml = blendProgressiveHtml(params, (current, total) => {
      const post: OutMsg = { type: 'progress', id, current, total }
      self.postMessage(post)
    })
    const res: OutMsg = { type: 'result', id, blendedHtml }
    self.postMessage(res)
  } catch (e) {
    const err: OutMsg = {
      type: 'error',
      id: msg.id,
      message: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(err)
  }
}
