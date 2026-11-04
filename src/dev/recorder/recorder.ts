/** Grava a sessão compartilhada numa subpasta: quadros (worker próprio, num clone da trilha de vídeo), áudio (contexto
 * próprio com o worklet da página), session.json e events.jsonl (o que a análise ao vivo fez e os erros do console).
 * Independente da análise ao vivo, para não pesar nela. */
import workletUrl from '../../live/audio-worklet.ts?worker&url'
import { audioTimeMs, outputTimestamp } from '../../live/capture'
import { hasFolderPicker } from './folder'
import type { LiveEvent } from '../../live/live-events'
import { EventLog } from './event-log'
import { finishSession, recordingName, startSession, type SessionFile } from './format'
import { summarize, type RecordingSummary } from './history'
import type { FramesIn, FramesOut } from './protocol'
import { isChrome, supportProblem } from './support'
import { SAMPLE_RATE, WavWriter } from './wav'

/** Quadros por segundo que a seção oferece. A análise ao vivo usa 10; gravar mais deixa o replay testar outras taxas. */
export const FRAME_RATES = [10, 15, 30] as const
export type FrameRate = (typeof FRAME_RATES)[number]
// quadros sendo codificados ou escritos ao mesmo tempo: um JPEG de 1080p leva uns 200 ms entre codificar e salvar
const MAX_FRAMES_IN_FLIGHT = 8
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
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return supportProblem({
    chrome: isChrome(brands),
    secure: window.isSecureContext,
    picker: hasFolderPicker(),
    processor: !!processor(),
  })
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function exists(root: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await root.getDirectoryHandle(name)
    return true
  } catch {
    return false
  }
}

async function writeJson(dir: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
  await w.write(JSON.stringify(value, null, 2))
  await w.close()
}

export type RecordingOptions = {
  fps: FrameRate
  /** Assina os eventos da análise ao vivo (o `onEvent` do runtime); devolve o cancelamento. */
  subscribe?: (fn: (e: LiveEvent) => void) => () => void
}

const now = () => performance.timeOrigin + performance.now()

function consoleText(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/** Copia avisos e erros do console e os erros soltos da página para `log` até o cancelamento devolvido. */
function captureConsole(log: (level: string, text: string) => void): () => void {
  const orig = { warn: console.warn, error: console.error }
  console.warn = (...a: unknown[]) => (log('warn', consoleText(a)), orig.warn.apply(console, a))
  console.error = (...a: unknown[]) => (log('error', consoleText(a)), orig.error.apply(console, a))
  const onError = (e: ErrorEvent) => log('error', e.error instanceof Error ? consoleText([e.error]) : e.message)
  const onRejection = (e: PromiseRejectionEvent) => log('error', `promessa rejeitada: ${consoleText([e.reason])}`)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    console.warn = orig.warn
    console.error = orig.error
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

export async function startRecording(
  stream: MediaStream,
  root: FileSystemDirectoryHandle,
  opts: RecordingOptions,
): Promise<ActiveRecording> {
  const intervalMs = Math.round(1000 / opts.fps)
  const Processor = processor()
  const video = stream.getVideoTracks()[0]
  const audioTrack = stream.getAudioTracks()[0] ?? null
  if (!Processor) throw new Error('Este navegador não tem MediaStreamTrackProcessor.')
  if (!video || video.readyState !== 'live') throw new Error('O compartilhamento não tem vídeo ativo.')

  const started = new Date()
  const startedAtMs = performance.timeOrigin + performance.now()
  const name = recordingName(started)
  // nome com resolução de 1 s: não misturar duas gravações na mesma pasta
  if (await exists(root, name)) throw new Error(`Já existe a gravação ${name}; tente de novo em um segundo.`)
  const dir = await root.getDirectoryHandle(name, { create: true })
  let session: SessionFile = startSession({
    startedAt: started,
    userAgent: navigator.userAgent,
    video: video.getSettings(),
    audio: audioTrack?.getSettings() ?? {},
    appVersion: __APP_VERSION__,
    frameIntervalMs: intervalMs,
  })
  let wav: WavWriter | null = null
  let events: EventLog | null = null
  let unsubscribe: (() => void) | null = null
  let restoreConsole: (() => void) | null = null

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
    unsubscribe?.()
    unsubscribe = null
    restoreConsole?.()
    restoreConsole = null
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
      if (fr.error) failure ??= `quadros: ${fr.error}`
      let audioSamples: number | null = null // null: o WAV não foi gravado
      try {
        audioSamples = await wav!.finish()
      } catch (err) {
        failure ??= `áudio: ${message(err)}`
      }
      events!.append({ type: 'recording', t: now(), event: 'stop', error: failure })
      try {
        await events!.finish()
      } catch (err) {
        failure ??= `events.jsonl: ${message(err)}`
      }
      session = finishSession(session, {
        endedAt: new Date(),
        frames: fr.frames,
        framesSkipped: fr.skipped,
        audioSamples,
        audioStartEpochMs,
        fallbackEpochMs: startedAtMs,
        error: failure, // gravação que parou por erro não aparece como completa
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
    const framesDir = await dir.getDirectoryHandle('frames', { create: true })
    await writeJson(dir, 'session.json', session) // já no começo: uma gravação interrompida aparece no histórico
    const writer = (wav = new WavWriter(await (await dir.getFileHandle('audio.wav', { create: true })).createWritable()))
    const log = (events = new EventLog(await (await dir.getFileHandle('events.jsonl', { create: true })).createWritable()))
    log.append({ type: 'recording', t: startedAtMs, event: 'start', name, fps: opts.fps, appVersion: __APP_VERSION__ })
    restoreConsole = captureConsole((level, text) => log.append({ type: 'console', t: now(), level, text }))
    unsubscribe = opts.subscribe?.((e) => log.append(e)) ?? null

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
        if (writer.error !== null) return fail(`áudio: ${message(writer.error)}`)
        audioStartEpochMs ??= performance.timeOrigin + audioTimeMs(e.data.frame, outputTimestamp(audioCtx))
        writer.append(e.data.samples)
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
      // o worker parou sozinho (erro, ou a trilha acabou antes do listener de 'ended'): a gravação para junto
      if (e.data.error) failure ??= `quadros: ${e.data.error}`
      void stop()
    }
    w.onerror = (e) => {
      resolveFrames({ frames, skipped, error: e.message || 'erro no worker' })
      void stop()
    }
    w.postMessage(
      { type: 'start', readable, dir: framesDir, intervalMs, maxInFlight: MAX_FRAMES_IN_FLIGHT } satisfies FramesIn,
      [readable],
    )
  } catch (err) {
    // começo que falhou: libera tudo e apaga a pasta pela metade, para não virar uma "incompleta" no histórico
    stopping = true
    release()
    await wav?.finish().catch(() => {})
    await events?.finish().catch(() => {})
    await root.removeEntry(name, { recursive: true }).catch(() => {})
    throw err
  }

  window.addEventListener('beforeunload', onBeforeUnload)
  video.addEventListener('ended', onEnded)

  return {
    stats: () => ({ name, startedAtMs: started.getTime(), frames, skipped, audioS: (wav?.samples ?? 0) / SAMPLE_RATE }),
    stop,
    done,
  }
}
