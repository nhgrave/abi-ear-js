/** Liga o compartilhamento de tela aos workers e ao Controller, e expõe um estado reativo para a interface. */
import { reactive } from 'vue'
import { Controller, type PickupOutcome } from '../engine/controller'
import { Dataset } from '../engine/data/dataset'
import type { SessionView } from '../engine/view'
import type { MessageKey } from '../i18n'
import workletUrl from './audio-worklet.ts?worker&url'
import { audioTimeMs, DISPLAY_MEDIA_OPTIONS, outputTimestamp, streamProblemKeys } from './capture'
import { audioHealth, cursorHealth, screenHealth, vendorHealth, type Health } from './health'
import type { AudioIn, AudioOut, VisionIn, VisionOut } from './protocol'

const FRAME_INTERVAL_MS = 100 // 10 quadros por segundo: duas ou três amostras do cursor na janela da atribuição
const HEALTH_INTERVAL_MS = 500
const PROFILE_KEY = 'abi-ear.profile'

export type LastPickup = { sound: string; score: number; outcome: PickupOutcome['kind']; reason: string | null }

export type RuntimeState = {
  loading: boolean
  sharing: boolean
  problems: MessageKey[]
  health: { audio: Health; screen: Health; vendor: Health; cursor: Health }
  view: SessionView
  profileId: number | null
  lastPickup: LastPickup | null
  resolution: [number, number] | null
  dataVersion: string
  syncedAt: string | null
}

const GRAY: Health = { level: 'gray', reason: 'screen.off' }
const EMPTY_VIEW: SessionView = { geometry: null, rowOffset: 0, extent: [0, 0], boxes: [] }

function readProfile(): number | null {
  try {
    const v = localStorage.getItem(PROFILE_KEY)
    return v === null || v === 'all' ? null : Number(v)
  } catch {
    return null
  }
}

function saveProfile(id: number | null): void {
  try {
    localStorage.setItem(PROFILE_KEY, id === null ? 'all' : String(id))
  } catch {
    /* preferência é só conveniência */
  }
}

export function createRuntime() {
  const state = reactive<RuntimeState>({
    loading: true,
    sharing: false,
    problems: [],
    health: { audio: { level: 'gray', reason: 'audio.noTrack' }, screen: GRAY, vendor: { level: 'gray', reason: 'vendor.none' }, cursor: { level: 'gray', reason: 'cursor.idle' } },
    view: EMPTY_VIEW,
    profileId: readProfile(),
    lastPickup: null,
    resolution: null,
    dataVersion: '?',
    syncedAt: null,
  })

  let ds: Dataset | null = null
  let controller: Controller | null = null
  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  let audioCtx: AudioContext | null = null
  let audioWorker: Worker | null = null
  let visionWorker: Worker | null = null
  let timers: number[] = []
  let visionBusy = false
  let sharingSince: number | null = null
  let lastChunkMs: number | null = null
  let lastFrameMs: number | null = null
  let vendorSince: number | null = null
  let means: [number, number][] = []
  let scores: number[] = []
  let nearMisses: number[] = []

  const refresh = () => {
    if (controller) state.view = controller.view()
  }

  async function load(): Promise<void> {
    try {
      const resp = await fetch('data/merchant.json')
      ds = new Dataset(await resp.json())
      controller = new Controller(ds)
      if (state.profileId !== null && !ds.profiles.has(state.profileId)) state.profileId = null
      controller.setProfile(state.profileId)
      state.dataVersion = ds.version
      state.syncedAt = ds.syncedAt
    } catch {
      state.problems = ['problem.load']
    } finally {
      state.loading = false
    }
  }

  async function decodeReferences(ctx: AudioContext): Promise<{ soundId: number; name: string; samples: Float32Array }[]> {
    return Promise.all(
      [...ds!.sounds.values()].map(async (s) => {
        const buf = await (await fetch(`data/sounds/${s.pickup}.ogg`)).arrayBuffer()
        const audio = await ctx.decodeAudioData(buf)
        const mono = new Float32Array(audio.length)
        for (let ch = 0; ch < audio.numberOfChannels; ch++) {
          const data = audio.getChannelData(ch)
          for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels
        }
        return { soundId: s.id, name: s.pickup, samples: mono }
      }),
    )
  }

  function onPickupOutcome(out: PickupOutcome): void {
    const sound = ds!.sounds.get(out.event.soundId)?.pickup ?? String(out.event.soundId)
    state.lastPickup = { sound, score: out.event.score, outcome: out.kind, reason: out.kind === 'unassigned' ? out.reason : null }
    refresh()
  }

  function updateHealth(): void {
    const now = performance.now()
    const vendorVisible = controller?.vendorVisible ?? false
    if (vendorVisible && vendorSince === null) vendorSince = now
    if (!vendorVisible) vendorSince = null
    means = means.filter(([t]) => now - t <= 3000)
    state.health = {
      audio: audioHealth({ hasTrack: (stream?.getAudioTracks().length ?? 0) > 0, lastChunkMs, now, scores, nearMisses }),
      screen: screenHealth({ sharing: state.sharing, lastFrameMs, now, means }),
      vendor: vendorHealth({ lastSeen: controller?.session.lastSeen ?? null, now, sharingSinceMs: sharingSince }),
      cursor: cursorHealth({ vendorVisible, lastArrowMs: controller?.lastArrowMs ?? null, now, vendorSinceMs: vendorSince }),
    }
  }

  async function start(): Promise<void> {
    state.problems = []
    if (!controller) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      state.problems = ['problem.browser']
      return
    }
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(DISPLAY_MEDIA_OPTIONS)
    } catch {
      state.problems = ['problem.denied']
      return
    }
    const track = stream.getVideoTracks()[0]
    const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string }
    const problems = streamProblemKeys({ audioTracks: stream.getAudioTracks().length, displaySurface: settings.displaySurface })
    if (problems.length) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
      state.problems = problems
      return
    }
    track.addEventListener('ended', stop)

    video = document.createElement('video')
    video.muted = true
    video.srcObject = stream
    await video.play().catch(() => {})

    audioCtx = new AudioContext({ sampleRate: 48000 })
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const refs = await decodeReferences(audioCtx)
    audioWorker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' })
    audioWorker.onmessage = (e: MessageEvent<AudioOut>) => {
      if (e.data.type !== 'events') return
      for (const ev of e.data.events) {
        if (ev.kind === 'near-miss') nearMisses = [...nearMisses.filter((t) => ev.t - t <= 60_000), ev.t]
        else {
          scores = [...scores.slice(-9), ev.score]
          onPickupOutcome(controller!.onPickup(ev))
        }
      }
    }
    audioWorker.postMessage({ type: 'refs', refs } satisfies AudioIn, refs.map((r) => r.samples.buffer))

    await audioCtx.audioWorklet.addModule(workletUrl)
    const source = audioCtx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(audioCtx, 'capture')
    const mute = audioCtx.createGain()
    mute.gain.value = 0
    source.connect(node)
    node.connect(mute)
    mute.connect(audioCtx.destination)
    node.port.onmessage = (e: MessageEvent<{ frame: number; samples: Float32Array }>) => {
      const tStartMs = audioTimeMs(e.data.frame, outputTimestamp(audioCtx!))
      lastChunkMs = performance.now()
      audioWorker?.postMessage({ type: 'audio', samples: e.data.samples, tStartMs } satisfies AudioIn, [e.data.samples.buffer])
    }

    visionWorker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' })
    visionWorker.onmessage = (e: MessageEvent<VisionOut>) => {
      visionBusy = false
      if (e.data.type !== 'result') return
      const r = e.data.result
      controller!.onFrame(r)
      lastFrameMs = r.t
      means.push([r.t, r.mean])
      if (r.scan !== undefined) refresh()
    }

    state.sharing = true
    sharingSince = performance.now()
    timers.push(
      window.setInterval(async () => {
        if (visionBusy || !video || video.videoWidth === 0) return
        visionBusy = true
        const t = performance.now() // mesma base do gravador: o instante da captura do quadro
        try {
          const bitmap = await createImageBitmap(video)
          state.resolution = [bitmap.width, bitmap.height]
          visionWorker?.postMessage({ type: 'frame', bitmap, t, hint: controller!.hint() } satisfies VisionIn, [bitmap])
        } catch {
          visionBusy = false
        }
      }, FRAME_INTERVAL_MS),
      window.setInterval(updateHealth, HEALTH_INTERVAL_MS),
    )
  }

  function stop(): void {
    timers.forEach((id) => clearInterval(id))
    timers = []
    audioWorker?.terminate()
    visionWorker?.terminate()
    audioWorker = visionWorker = null
    void audioCtx?.close()
    audioCtx = null
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    video = null
    visionBusy = false
    state.sharing = false
    sharingSince = lastChunkMs = lastFrameMs = vendorSince = null
    updateHealth() // a sessão fica no Controller até recarregar a página
  }

  function setProfile(id: number | null): void {
    state.profileId = id
    saveProfile(id)
    controller?.setProfile(id)
    refresh()
  }

  function clear(): void {
    controller?.clear()
    state.lastPickup = null
    refresh()
  }

  return { state, load, start, stop, setProfile, clear, dataset: () => ds }
}

export type Runtime = ReturnType<typeof createRuntime>
