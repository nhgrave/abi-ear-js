/// <reference lib="webworker" />
// Visão fora da thread da página: cada quadro vira cursor e, de tempos em tempos, grid do vendedor.
import { FramePipeline } from '../engine/pipeline'
import { rgbaToGrayInto, type Gray } from '../engine/vision/image'
import type { GridGeometry } from '../engine/vision/types'
import type { VisionIn, VisionOut } from './protocol'

let pipeline = new FramePipeline()
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let hint: GridGeometry | null = null
let gray: Gray | null = null // reaproveitada a cada quadro; a metade esquerda fica zerada
const post = (m: VisionOut) => (self as unknown as Worker).postMessage(m)

/** Só a metade direita da tela é lida: o vendedor, o cursor sobre ele e as abas ficam nela (scanVendor). Metade dos
 * bytes copiados da GPU e convertidos a cada quadro. */
function analyse(source: CanvasImageSource, w: number, h: number, t: number): void {
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas = new OffscreenCanvas(w, h)
    ctx = canvas.getContext('2d', { willReadFrequently: true })
    gray = { w, h, data: new Uint8Array(w * h) }
  }
  ctx!.drawImage(source, 0, 0)
  const x0 = Math.floor(w / 2)
  const rgba = ctx!.getImageData(x0, 0, w - x0, h).data
  rgbaToGrayInto(rgba, w - x0, h, gray!, x0)
  post({ type: 'result', result: pipeline.process(gray!, t, hint, { w: w - x0, h, data: rgba, x0 }), size: [w, h] })
}

async function readStream(readable: ReadableStream<VideoFrame>, originMs: number, intervalMs: number): Promise<void> {
  const reader = readable.getReader()
  let last = -Infinity
  for (;;) {
    const { value: frame, done } = await reader.read()
    if (done || !frame) return
    try {
      const t = performance.timeOrigin + performance.now() - originMs // instante da chegada, no relógio da página
      if (t - last >= intervalMs) {
        last = t
        analyse(frame, frame.displayWidth, frame.displayHeight, t)
      }
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      frame.close()
    }
  }
}

self.onmessage = (e: MessageEvent<VisionIn>) => {
  const m = e.data
  if (m.type === 'hint') hint = m.hint
  else if (m.type === 'models') pipeline = new FramePipeline(m.models)
  else if (m.type === 'stream') void readStream(m.readable, m.originMs, m.intervalMs)
  else if (m.type === 'frame') {
    try {
      analyse(m.bitmap, m.bitmap.width, m.bitmap.height, m.t)
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      m.bitmap.close()
    }
  }
}
