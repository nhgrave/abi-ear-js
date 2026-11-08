/** Liga o compartilhamento de tela aos workers e ao Controller, e expõe um estado reativo para a interface. */
import { reactive } from 'vue'
import { Controller, type PickupOutcome } from '../engine/controller'
import { Dataset } from '../engine/data/dataset'
import { parseProfileChoice, profileChoiceValue, type ProfileChoice } from '../engine/profiles'
import type { LabelModels } from '../engine/vision/label-reader'
import type { SessionView } from '../engine/view'
import type { MessageKey } from '../i18n'
import workletUrl from './audio-worklet.ts?worker&url'
import { LABEL_MODELS_URLS, loadLabelModels } from './label-data'
import { createIconLookup } from './icons'
import { audioTimeMs, DISPLAY_MEDIA_OPTIONS, outputTimestamp, streamProblemKeys } from './capture'
import { LiveEvents, pickupEvent, type LiveEvent } from './live-events'
import { audioHealth, cursorHealth, screenHealth, vendorHealth, type Health } from './health'
import type { AudioIn, AudioOut, VisionIn, VisionOut } from './protocol'

const FRAME_INTERVAL_MS = 100 // 10 quadros por segundo: duas ou três amostras do cursor na janela da atribuição
const HEALTH_INTERVAL_MS = 500
const PROFILE_KEY = 'abi-ear.profile'

type Ref = { soundId: number; name: string; samples: Float32Array }
/** `uid`: a caixa que recebeu a pegada (a interface a seleciona), null se nenhuma. */
export type LastPickup = { sound: string; score: number; outcome: PickupOutcome['kind']; reason: string | null; uid: number | null }

export type RuntimeState = {
  loading: boolean
  ready: boolean // base e sons carregados
  starting: boolean
  sharing: boolean
  example: boolean // mostrando o exemplo (vendedor e pegadas de mentira), não o jogo
  problems: MessageKey[]
  health: { audio: Health; screen: Health; vendor: Health; cursor: Health }
  view: SessionView
  profile: ProfileChoice
  lastPickup: LastPickup | null
  resolution: [number, number] | null
  dataVersion: string
  syncedAt: string | null
}

const EMPTY_VIEW: SessionView = { geometry: null, rowOffset: 0, extent: [0, 0], boxes: [] }
const idleHealth = (): RuntimeState['health'] => ({
  audio: { level: 'gray', reason: 'screen.off' },
  screen: { level: 'gray', reason: 'screen.off' },
  vendor: { level: 'gray', reason: 'vendor.none' },
  cursor: { level: 'gray', reason: 'cursor.idle' },
})

function readProfile(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY)
  } catch {
    return null
  }
}

function saveProfile(c: ProfileChoice): void {
  try {
    localStorage.setItem(PROFILE_KEY, profileChoiceValue(c))
  } catch {
    /* preferência é só conveniência */
  }
}

/** Decodifica os sons de pegar uma vez, a 48 kHz mono, sem precisar de um AudioContext ao vivo. */
async function decodeReferences(ds: Dataset): Promise<Ref[]> {
  const ctx = new OfflineAudioContext(1, 48000, 48000)
  return Promise.all(
    [...ds.sounds.values()].map(async (s) => {
      const resp = await fetch(`data/sounds/${s.pickup}.ogg`)
      if (!resp.ok) throw new Error(`som ${s.pickup}: HTTP ${resp.status}`)
      const audio = await ctx.decodeAudioData(await resp.arrayBuffer())
      const mono = new Float32Array(audio.length)
      for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        const data = audio.getChannelData(ch)
        for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels
      }
      return { soundId: s.id, name: s.pickup, samples: mono }
    }),
  )
}

/** O que uma sessão de compartilhamento abriu, para fechar tudo junto. */
type Live = {
  stream: MediaStream
  audioCtx: AudioContext | null
  node: AudioWorkletNode | null
  audioWorker: Worker | null
  visionWorker: Worker | null
  video: HTMLVideoElement | null
  timers: number[]
}

export function createRuntime() {
  const state = reactive<RuntimeState>({
    loading: true,
    ready: false,
    starting: false,
    sharing: false,
    example: false,
    problems: [],
    health: idleHealth(),
    view: EMPTY_VIEW,
    profile: parseProfileChoice(readProfile()),
    lastPickup: null,
    resolution: null,
    dataVersion: '?',
    syncedAt: null,
  })

  let ds: Dataset | null = null
  let refs: Ref[] = []
  let models: LabelModels | null = null
  let controller: Controller | null = null
  let live: Live | null = null
  let session = 0 // muda a cada start/stop: callbacks de uma sessão antiga não mexem na nova
  let healthTimer: number | null = null
  let sharingSince: number | null = null
  let lastChunkMs: number | null = null
  let lastFrameMs: number | null = null
  let lastNoCursorMs: number | null = null
  let means: [number, number][] = []
  let scores: number[] = []
  let nearMisses: number[] = []
  const events = new LiveEvents()
  const soundName = (id: number) => ds?.sounds.get(id)?.pickup ?? String(id)
  const publishState = () => events.state(performance.timeOrigin + performance.now(), state.health, state.problems)

  const refresh = () => {
    if (controller && !state.example) state.view = controller.view()
  }

  async function load(): Promise<void> {
    try {
      const resp = await fetch('data/merchant.json')
      if (!resp.ok) throw new Error(`base: HTTP ${resp.status}`)
      ds = new Dataset(await resp.json())
      models = await loadLabelModels() // opcional: sem modelos, segue sem ler os rótulos
      if (!models) console.warn(`abi-ear: modelos de rótulo indisponíveis (${LABEL_MODELS_URLS.join(', ')}); seguindo sem ler os rótulos`)
      controller = new Controller(ds)
      controller.icons = createIconLookup() // caixas reveladas: compara a imagem delas com os ícones dos itens
      state.profile = parseProfileChoice(readProfile(), ds) // perfil que a base não tem mais: automático
      controller.setProfile(state.profile)
      state.dataVersion = ds.version
      state.syncedAt = ds.syncedAt
      refs = await decodeReferences(ds)
      state.ready = true
    } catch {
      state.problems = ['problem.load']
    } finally {
      state.loading = false
    }
  }

  function onPickupOutcome(out: PickupOutcome): void {
    const sound = soundName(out.event.soundId)
    const box = out.kind === 'assigned' ? (controller?.session.boxByUid(out.uid) ?? null) : null
    events.emit(pickupEvent(out, sound, box, performance.timeOrigin))
    state.lastPickup = {
      sound,
      score: out.event.score,
      outcome: out.kind,
      reason: out.kind === 'unassigned' ? out.reason : null,
      uid: out.kind === 'assigned' ? out.uid : null,
    }
    if (out.kind === 'unassigned' && out.reason === 'no-cursor') lastNoCursorMs = performance.now()
    refresh()
  }

  function updateHealth(): void {
    const now = performance.now()
    const vendorVisible = state.sharing && (controller?.vendorVisible ?? false)
    means = means.filter(([t]) => now - t <= 3000)
    state.health = {
      audio: audioHealth({ sharing: state.sharing, hasTrack: (live?.stream.getAudioTracks().length ?? 0) > 0, lastChunkMs, now, scores, nearMisses }),
      screen: screenHealth({ sharing: state.sharing, lastFrameMs, now, means }),
      vendor: vendorHealth({ lastSeen: state.sharing ? (controller?.session.lastSeen ?? null) : null, now, sharingSinceMs: sharingSince }),
      cursor: cursorHealth({ vendorVisible, lastArrowMs: controller?.lastArrowMs ?? null, now, lastNoCursorMs }),
    }
    publishState()
  }

  function fail(problem: MessageKey): void {
    stop()
    if (!state.problems.includes(problem)) state.problems = [...state.problems, problem]
  }

  async function start(): Promise<void> {
    if (state.starting || state.sharing || !controller || !state.ready) return
    if (state.example) leaveExample()
    state.problems = []
    if (!navigator.mediaDevices?.getDisplayMedia) {
      state.problems = ['problem.browser']
      return
    }
    state.starting = true
    const token = ++session
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(DISPLAY_MEDIA_OPTIONS)
      } catch {
        state.problems = ['problem.denied']
        return
      }
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string }
      const problems = streamProblemKeys({ audioTracks: stream.getAudioTracks().length, displaySurface: settings.displaySurface })
      if (problems.length || token !== session) {
        stream.getTracks().forEach((t) => t.stop())
        state.problems = problems
        return
      }
      const l: Live = { stream, audioCtx: null, node: null, audioWorker: null, visionWorker: null, video: null, timers: [] }
      live = l
      track.addEventListener('ended', () => {
        if (token === session) stop()
      })
      scores = []
      nearMisses = []
      means = []
      lastNoCursorMs = null

      // áudio: worklet -> tempo da página -> worker de escuta
      const audioWorker = (l.audioWorker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' }))
      audioWorker.onerror = () => token === session && fail('problem.worker')
      audioWorker.onmessage = (e: MessageEvent<AudioOut>) => {
        if (token !== session || e.data.type !== 'events') return
        for (const ev of e.data.events) {
          if (ev.kind === 'near-miss') {
            nearMisses = [...nearMisses.filter((t) => ev.t - t <= 60_000), ev.t]
            events.emit({ type: 'near-miss', t: performance.timeOrigin + ev.t, sound: soundName(ev.soundId), score: ev.score })
          } else {
            scores = [...scores.slice(-9), ev.score]
            onPickupOutcome(controller!.onPickup(ev))
          }
        }
      }
      audioWorker.postMessage({ type: 'refs', refs } satisfies AudioIn) // cópia: as referências servem para o próximo start

      const audioCtx = (l.audioCtx = new AudioContext({ sampleRate: 48000 }))
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      await audioCtx.audioWorklet.addModule(workletUrl)
      if (token !== session) return
      const source = audioCtx.createMediaStreamSource(stream)
      const node = (l.node = new AudioWorkletNode(audioCtx, 'capture'))
      const mute = audioCtx.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute)
      mute.connect(audioCtx.destination)
      node.port.onmessage = (e: MessageEvent<{ frame: number; samples: Float32Array }>) => {
        if (token !== session) return
        const tStartMs = audioTimeMs(e.data.frame, outputTimestamp(audioCtx))
        lastChunkMs = performance.now()
        audioWorker.postMessage({ type: 'audio', samples: e.data.samples, tStartMs } satisfies AudioIn, [e.data.samples.buffer])
      }

      // visão: quadros direto no worker (o timer da página é desacelerado quando o jogo está na frente)
      const visionWorker = (l.visionWorker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' }))
      visionWorker.onerror = () => token === session && fail('problem.worker')
      if (models) visionWorker.postMessage({ type: 'models', models } satisfies VisionIn) // antes dos quadros
      let busy = false
      visionWorker.onmessage = (e: MessageEvent<VisionOut>) => {
        busy = false
        if (token !== session || e.data.type !== 'result') return
        const r = e.data.result
        controller!.onFrame(r)
        lastFrameMs = r.t
        means.push([r.t, r.mean])
        const [w, h] = e.data.size
        if (!state.resolution || state.resolution[0] !== w || state.resolution[1] !== h) state.resolution = [w, h]
        visionWorker.postMessage({ type: 'hint', hint: controller!.hint() } satisfies VisionIn)
        if (r.scan !== undefined) refresh()
      }
      const Processor = (globalThis as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } })
        .MediaStreamTrackProcessor
      if (Processor) {
        const { readable } = new Processor({ track })
        visionWorker.postMessage({ type: 'stream', readable, originMs: performance.timeOrigin, intervalMs: FRAME_INTERVAL_MS } satisfies VisionIn, [readable])
      } else {
        // sem o processor: um <video> na página (fora dela o Chrome pode parar de atualizar) e um timer
        const video = (l.video = document.createElement('video'))
        video.muted = true
        video.playsInline = true
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
        document.body.appendChild(video)
        video.srcObject = stream
        await video.play().catch(() => {})
        l.timers.push(
          window.setInterval(async () => {
            if (busy || video.videoWidth === 0 || token !== session) return
            busy = true
            const t = performance.now()
            try {
              const bitmap = await createImageBitmap(video)
              if (token !== session) return bitmap.close()
              visionWorker.postMessage({ type: 'frame', bitmap, t } satisfies VisionIn, [bitmap])
            } catch {
              busy = false
            }
          }, FRAME_INTERVAL_MS),
        )
      }

      state.sharing = true
      sharingSince = performance.now()
      if (healthTimer === null) healthTimer = window.setInterval(updateHealth, HEALTH_INTERVAL_MS)
    } catch {
      if (token === session) fail('problem.start')
    } finally {
      state.starting = false
      publishState() // avisos de um começo que falhou
    }
  }

  function stop(): void {
    session++
    const l = live
    live = null
    if (l) {
      l.timers.forEach((id) => clearInterval(id))
      if (l.node) l.node.port.onmessage = null
      l.audioWorker?.terminate()
      l.visionWorker?.terminate()
      void l.audioCtx?.close().catch(() => {})
      l.stream.getTracks().forEach((t) => t.stop())
      l.video?.remove()
    }
    state.sharing = false
    sharingSince = lastChunkMs = lastFrameMs = null
    updateHealth() // a sessão fica no Controller até recarregar a página
  }

  function setProfile(c: ProfileChoice): void {
    state.profile = c
    saveProfile(c)
    controller?.setProfile(c)
    refresh()
  }

  function clear(): void {
    if (state.example) return leaveExample()
    controller?.clear()
    state.lastPickup = null
    refresh()
  }

  /** Mostra o exemplo: um vendedor de verdade com pegadas de mentira, sem o jogo. `selectBox`: abre o painel de uma
   * caixa pega (sem ela, a ajuda fica à vista). */
  async function showExample(selectBox = true): Promise<void> {
    if (!ds || state.sharing) return
    const { exampleView } = await import('../example/example')
    state.example = true
    state.problems = []
    state.view = exampleView(ds)
    const ok = (reason: string) => ({ level: 'green' as const, reason })
    state.health = { audio: ok('audio.ok'), screen: ok('screen.ok'), vendor: ok('vendor.ok'), cursor: ok('cursor.ok') }
    const picked = state.view.boxes.find((b) => b.picks > 0 && b.candidates.length > 1)
    state.lastPickup = picked
      ? { sound: 'Item_Misc_ElectronicDevice_Up', score: 0.93, outcome: 'assigned', reason: null, uid: selectBox ? picked.uid : null }
      : null
  }

  /** Volta para a página vazia, pronta para compartilhar a tela. */
  function leaveExample(): void {
    if (!state.example) return
    state.example = false
    state.health = idleHealth()
    state.lastPickup = null
    controller?.clear()
    refresh()
  }

  /** O stream compartilhado agora (o gravador do modo local usa o mesmo). */
  const stream = (): MediaStream | null => live?.stream ?? null

  /** Assina o que a análise ao vivo faz (pegadas, saúde, avisos); devolve o cancelamento. */
  const onEvent = (fn: (e: LiveEvent) => void): (() => void) => events.on(fn)

  return { state, load, start, stop, setProfile, clear, showExample, leaveExample, dataset: () => ds, stream, onEvent }
}

export type Runtime = ReturnType<typeof createRuntime>
