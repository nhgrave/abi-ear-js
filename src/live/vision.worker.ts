/// <reference lib="webworker" />
// Visão fora da thread da página: cada quadro (ImageBitmap transferido) vira cursor e, de tempos em tempos, grid.
import { FramePipeline } from '../engine/pipeline'
import { rgbaToGray } from '../engine/vision/image'
import type { VisionIn, VisionOut } from './protocol'

const pipeline = new FramePipeline()
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
const post = (m: VisionOut) => (self as unknown as Worker).postMessage(m)

self.onmessage = (e: MessageEvent<VisionIn>) => {
  const { bitmap, t, hint } = e.data
  try {
    if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }
    ctx!.drawImage(bitmap, 0, 0)
    const rgba = ctx!.getImageData(0, 0, bitmap.width, bitmap.height).data
    const gray = rgbaToGray(rgba, bitmap.width, bitmap.height)
    post({ type: 'result', result: pipeline.process(gray, t, hint) })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    bitmap.close()
  }
}
