/// <reference lib="webworker" />
// Gravação de quadros em worker: recebe os VideoFrames, cadencia e grava JPEGs na pasta.
import { FrameRecorder } from './frame-recorder'
import type { FramesIn, FramesOut } from './protocol'

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let recorder: FrameRecorder<VideoFrame> | null = null
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null
let progressTimer: ReturnType<typeof setInterval> | null = null
let finishPromise: Promise<void> | null = null
let stopped = false

const post = (m: FramesOut) => (self as unknown as Worker).postMessage(m)

function encode(frame: VideoFrame): Promise<Blob> {
  const w = frame.displayWidth
  const h = frame.displayHeight
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas = new OffscreenCanvas(w, h)
    ctx = canvas.getContext('2d')
  }
  if (!ctx) throw new Error('Não foi possível obter contexto 2d do OffscreenCanvas')
  ctx.drawImage(frame, 0, 0)
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
}

async function writeFrame(dir: FileSystemDirectoryHandle, name: string, data: Blob): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(data)
  await writable.close()
}

function finish(
  r: ReadableStreamDefaultReader<VideoFrame> | null,
  rec: FrameRecorder<VideoFrame>,
): Promise<void> {
  if (finishPromise) return finishPromise
  finishPromise = (async () => {
    stopped = true
    if (progressTimer !== null) {
      clearInterval(progressTimer)
      progressTimer = null
    }
    if (r) {
      try {
        await r.cancel()
      } catch {
        // Reader pode já estar fechado ou cancelado
      }
    }
    const res = await rec.drain()
    post({
      type: 'stopped',
      frames: res.frames,
      skipped: res.skipped,
      error: res.error,
    })
  })()
  return finishPromise
}

async function run(
  r: ReadableStreamDefaultReader<VideoFrame>,
  rec: FrameRecorder<VideoFrame>,
): Promise<void> {
  try {
    for (;;) {
      const { value: frame, done } = await r.read()
      if (done || !frame) break
      const epochMs = performance.timeOrigin + performance.now()
      let status: 'taken' | 'early' | 'skipped' | 'stopped'
      try {
        status = rec.offer(frame, epochMs)
      } finally {
        frame.close()
      }
      if (status === 'stopped') {
        break
      }
    }
  } catch (err) {
    if (!rec.error) {
      rec.error = err instanceof Error ? err.message : String(err)
    }
  } finally {
    await finish(r, rec)
  }
}

self.onmessage = (e: MessageEvent<FramesIn>) => {
  const m = e.data
  if (m.type === 'start') {
    if (progressTimer !== null) {
      clearInterval(progressTimer)
      progressTimer = null
    }
    finishPromise = null
    stopped = false
    const rec = new FrameRecorder<VideoFrame>({
      intervalMs: m.intervalMs,
      encode,
      write: (name, data) => writeFrame(m.dir, name, data),
    })
    recorder = rec
    const r = m.readable.getReader()
    reader = r

    progressTimer = setInterval(() => {
      if (!stopped) {
        post({ type: 'progress', frames: rec.frames, skipped: rec.skipped })
      }
    }, 1000)

    void run(r, rec)
  } else if (m.type === 'stop') {
    if (recorder) {
      void finish(reader, recorder)
    }
  }
}
