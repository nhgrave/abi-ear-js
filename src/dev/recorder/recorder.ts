/** Grava a sessão compartilhada numa subpasta: quadros (worker próprio, num clone da trilha de vídeo), áudio (contexto
 * próprio com o worklet da página) e session.json. Independente da análise ao vivo, para não pesar nela. */
import workletUrl from '../../live/audio-worklet.ts?worker&url'
import { audioTimeMs, outputTimestamp } from '../../live/capture'
import { hasFolderPicker } from './folder'
import { finishSession, recordingName, startSession, type SessionFile } from './format'
import { summarize, type RecordingSummary } from './history'
import type { FramesIn, FramesOut } from './protocol'
import { SAMPLE_RATE, WavWriter } from './wav'

const FRAME_INTERVAL_MS = 100
const WORKER_STOP_TIMEOUT_MS = 5000

type Processor = new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> }
const processor = () => (globalThis as { MediaStreamTrackProcessor?: Processor }).MediaStreamTrackProcessor

export type RecordingStats = { name: string; startedAtMs: number; frames: number; skipped: number; audioS: number }
export type ActiveRecording = {
  stats(): RecordingStats
  /** Para e salva; chamar de novo devolve a mesma promessa. */
  stop(): Promise<RecordingSummary>
  /** Resolve quando a gravação termina: com a mensagem do erro que a parou, ou null. */
  done: Promise<string | null>
}

/** null se dá para gravar neste navegador, senão o que falta. */
export function recordingSupport(): string | null {
  if (!hasFolderPicker()) return 'Este navegador não tem File System Access.'
  if (!processor()) return 'Este navegador não tem MediaStreamTrackProcessor.'
  return null
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function writeJson(dir: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
  await w.write(JSON.stringify(value, null, 2))
  await w.close()
}

export async function startRecording(stream: MediaStream, root: FileSystemDirectoryHandle): Promise<ActiveRecording> {
  const Processor = processor()
  const video = stream.getVideoTracks()[0]
  const audioTrack = stream.getAudioTracks()[0] ?? null
  if (!Processor) throw new Error('Este navegador não tem MediaStreamTrackProcessor.')
  if (!video || video.readyState !== 'live') throw new Error('O compartilhamento não tem vídeo ativo.')

  const started = new Date()
  const startedAtMs = performance.timeOrigin + performance.now()
  const name = recordingName(started)
  const dir = await root.getDirectoryHandle(name, { create: true })
  const framesDir = await dir.getDirectoryHandle('frames', { create: true })
  let session: SessionFile = startSession({
    startedAt: started,
    userAgent: navigator.userAgent,
    video: video.getSettings(),
    audio: audioTrack?.getSettings() ?? {},
    appVersion: __APP_VERSION__,
    frameIntervalMs: FRAME_INTERVAL_MS,
  })
  await writeJson(dir, 'session.json', session) // já no começo: uma gravação interrompida aparece no histórico
  const wav = new WavWriter(await (await dir.getFileHandle('audio.wav', { create: true })).createWritable())

  let ctx: AudioContext | null = null
  let node: AudioWorkletNode | null = null
  let worker: Worker | null = null
  let clone: MediaStreamTrack | null = null
  let stopping = false
  let failure: string | null = null
  let audioStartEpochMs: number | null = null
  let frames = 0
  let skipped = 0
  let stopPromise: Promise<RecordingSummary> | null = null
  let resolveDone!: (error: string | null) => void
  const done = new Promise<string | null>((r) => (resolveDone = r))
  let resolveFrames!: (r: { frames: number; skipped: number; error: string | null }) => void
  const framesStopped = new Promise<{ frames: number; skipped: number; error: string | null }>((r) => (resolveFrames = r))

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault()
    e.returnValue = '' // navegadores antigos
  }
  const onEnded = () => void stop()
  const fail = (msg: string) => {
    failure ??= msg
    void stop()
  }

  const release = () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    video.removeEventListener('ended', onEnded)
    if (node) node.port.onmessage = null
    worker?.terminate()
    clone?.stop()
    void ctx?.close().catch(() => {})
  }

  function stop(): Promise<RecordingSummary> {
    stopPromise ??= (async () => {
      stopping = true
      if (node) node.port.onmessage = null
      worker?.postMessage({ type: 'stop' } satisfies FramesIn)
      const timeout = new Promise<{ frames: number; skipped: number; error: string | null }>((r) =>
        setTimeout(() => r({ frames, skipped, error: 'o worker de quadros não respondeu ao parar' }), WORKER_STOP_TIMEOUT_MS),
      )
      const fr = await Promise.race([framesStopped, timeout])
      release()
      if (fr.error) failure ??= fr.error
      let audioSamples = wav.samples
      try {
        audioSamples = await wav.finish()
      } catch (err) {
        failure ??= `áudio: ${message(err)}`
      }
      session = finishSession(session, {
        endedAt: new Date(),
        frames: fr.frames,
        framesSkipped: fr.skipped,
        audioSamples,
        audioStartEpochMs,
        fallbackEpochMs: startedAtMs,
      })
      try {
        await writeJson(dir, 'session.json', session)
      } catch (err) {
        failure ??= `session.json: ${message(err)}`
      }
      resolveDone(failure)
      return summarize(name, session, null, null)
    })()
    return stopPromise
  }

  try {
    // áudio: contexto próprio com o worklet da página; o tempo da primeira amostra vem do getOutputTimestamp dele
    if (audioTrack) {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      if (ctx.state === 'suspended') await ctx.resume()
      await ctx.audioWorklet.addModule(workletUrl)
      const source = ctx.createMediaStreamSource(stream)
      node = new AudioWorkletNode(ctx, 'capture')
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute)
      mute.connect(ctx.destination)
      const audioCtx = ctx
      node.port.onmessage = (e: MessageEvent<{ frame: number; samples: Float32Array }>) => {
        if (stopping) return
        if (wav.error !== null) return fail(`áudio: ${message(wav.error)}`)
        audioStartEpochMs ??= performance.timeOrigin + audioTimeMs(e.data.frame, outputTimestamp(audioCtx))
        wav.append(e.data.samples)
      }
    }

    // quadros: worker próprio lendo um clone da trilha, para não disputar quadros com a análise ao vivo
    clone = video.clone()
    const { readable } = new Processor({ track: clone })
    const w = (worker = new Worker(new URL('./frames.worker.ts', import.meta.url), { type: 'module' }))
    w.onmessage = (e: MessageEvent<FramesOut>) => {
      frames = e.data.frames
      skipped = e.data.skipped
      if (e.data.type !== 'stopped') return
      resolveFrames(e.data)
      if (e.data.error) fail(`quadros: ${e.data.error}`)
    }
    w.onerror = (e) => {
      resolveFrames({ frames, skipped, error: e.message || 'erro no worker de quadros' })
      fail(`quadros: ${e.message || 'erro no worker'}`)
    }
    w.postMessage({ type: 'start', readable, dir: framesDir, intervalMs: FRAME_INTERVAL_MS } satisfies FramesIn, [readable])
  } catch (err) {
    stopping = true
    release()
    await wav.finish().catch(() => {})
    throw err
  }

  window.addEventListener('beforeunload', onBeforeUnload)
  video.addEventListener('ended', onEnded)

  return {
    stats: () => ({ name, startedAtMs: started.getTime(), frames, skipped, audioS: wav.samples / SAMPLE_RATE }),
    stop,
    done,
  }
}
