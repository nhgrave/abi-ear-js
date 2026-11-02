/// <reference types="vite/client" />
import { encodeWav, epochOfFrame, streamProblems, SessionMeta, levelDb } from './format'
import workletUrl from './capture-worklet.ts?worker&url'

declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
  }
}

// DOM Elements
const errorBannerEl = document.getElementById('error-banner') as HTMLDivElement
const errorMessageEl = document.getElementById('error-message') as HTMLSpanElement
const btnCloseErrorEl = document.getElementById('btn-close-error') as HTMLButtonElement

const step1CardEl = document.getElementById('step1-card') as HTMLElement
const step1BadgeEl = document.getElementById('step1-badge') as HTMLSpanElement
const step1StatusEl = document.getElementById('step1-status') as HTMLDivElement
const btnChooseFolderEl = document.getElementById('btn-choose-folder') as HTMLButtonElement

const step2CardEl = document.getElementById('step2-card') as HTMLElement
const step2BadgeEl = document.getElementById('step2-badge') as HTMLSpanElement
const step2StatusEl = document.getElementById('step2-status') as HTMLDivElement
const streamProblemsEl = document.getElementById('stream-problems') as HTMLDivElement
const problemsListEl = document.getElementById('problems-list') as HTMLUListElement
const btnShareScreenEl = document.getElementById('btn-share-screen') as HTMLButtonElement
const btnShareAgainEl = document.getElementById('btn-share-again') as HTMLButtonElement
const videoWrapperEl = document.getElementById('video-wrapper') as HTMLDivElement
const videoPreviewEl = document.getElementById('video-preview') as HTMLVideoElement

const step3CardEl = document.getElementById('step3-card') as HTMLElement
const step3BadgeEl = document.getElementById('step3-badge') as HTMLSpanElement
const step3StatusEl = document.getElementById('step3-status') as HTMLDivElement
const btnRecordEl = document.getElementById('btn-record') as HTMLButtonElement

const recordingSectionEl = document.getElementById('recording-section') as HTMLDivElement
const recIndicatorEl = document.getElementById('rec-indicator') as HTMLDivElement
const recStatusTextEl = document.getElementById('rec-status-text') as HTMLSpanElement
const statSubfolderEl = document.getElementById('stat-subfolder') as HTMLDivElement
const silentWarningEl = document.getElementById('silent-warning') as HTMLDivElement
const statElapsedEl = document.getElementById('stat-elapsed') as HTMLDivElement
const statFramesEl = document.getElementById('stat-frames') as HTMLDivElement
const statSkippedEl = document.getElementById('stat-skipped') as HTMLDivElement
const statAudioEl = document.getElementById('stat-audio') as HTMLDivElement
const statResEl = document.getElementById('stat-res') as HTMLDivElement
const meterReadoutEl = document.getElementById('meter-readout') as HTMLSpanElement
const meterFillEl = document.getElementById('meter-fill') as HTMLDivElement

const saveSummaryEl = document.getElementById('save-summary') as HTMLDivElement
const summarySubfolderEl = document.getElementById('summary-subfolder') as HTMLElement
const summaryDurationEl = document.getElementById('summary-duration') as HTMLSpanElement
const summaryFramesEl = document.getElementById('summary-frames') as HTMLSpanElement
const summaryAudioEl = document.getElementById('summary-audio') as HTMLSpanElement

// Application State
let rootDirectoryHandle: FileSystemDirectoryHandle | null = null
let currentStream: MediaStream | null = null
let videoTrack: MediaStreamTrack | null = null
let audioTrack: MediaStreamTrack | null = null

let audioContext: AudioContext | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let workletNode: AudioWorkletNode | null = null
let gainNode: GainNode | null = null

let isRecording = false
let isStopping = false
let recordingStartTime: Date | null = null
let currentSubfolderName = ''
let currentSessionDir: FileSystemDirectoryHandle | null = null
let currentFramesDir: FileSystemDirectoryHandle | null = null

let recordedAudioChunks: Float32Array[] = []
let audioStartEpochMs: number | null = null
let totalAudioSamplesRecorded = 0

let frameIntervalTimer: number | null = null
let uiUpdateTimer: number | null = null
let isWritingFrame = false
let framesWritten = 0
let framesSkipped = 0
let silentDurationMs = 0

// Sliding buffer of the last second of audio (48000 samples @ 48 kHz)
const AUDIO_BUFFER_SIZE = 48000
const recentAudio = new Float32Array(AUDIO_BUFFER_SIZE)
let recentAudioIndex = 0
let recentAudioFilled = 0
let currentPeak = 0
let currentRms = 0

function showError(msg: string): void {
  errorMessageEl.textContent = msg
  errorBannerEl.classList.remove('banner-info')
  errorBannerEl.classList.add('banner-error', 'visible')
}

function showNotice(msg: string): void {
  errorMessageEl.textContent = msg
  errorBannerEl.classList.remove('banner-error')
  errorBannerEl.classList.add('banner-info', 'visible')
}

function clearBanner(): void {
  errorMessageEl.textContent = ''
  errorBannerEl.classList.remove('visible', 'banner-error', 'banner-info')
}

btnCloseErrorEl.addEventListener('click', clearBanner)

function formatDb(db: number): string {
  const rounded = Math.round(db)
  const val = Object.is(rounded, -0) ? 0 : rounded
  return `${val < 0 ? '−' + Math.abs(val) : val} dB`
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  e.preventDefault()
  e.returnValue = ''
}

function formatSubfolderName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const YYYY = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const DD = pad(date.getDate())
  const HH = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const SS = pad(date.getSeconds())
  return `${YYYY}-${MM}-${DD}-${HH}${mm}${SS}`
}

function updateRecentAudio(samples: Float32Array): void {
  for (let i = 0; i < samples.length; i++) {
    recentAudio[recentAudioIndex] = samples[i]
    recentAudioIndex = (recentAudioIndex + 1) % AUDIO_BUFFER_SIZE
    if (recentAudioFilled < AUDIO_BUFFER_SIZE) {
      recentAudioFilled++
    }
  }

  const count = recentAudioFilled
  let sumSq = 0
  let peak = 0
  for (let i = 0; i < count; i++) {
    const val = Math.abs(recentAudio[i])
    if (val > peak) peak = val
    sumSq += val * val
  }
  currentPeak = peak
  currentRms = count > 0 ? Math.sqrt(sumSq / count) : 0
}

function getStreamProblemsList(): string[] {
  if (!currentStream) return []
  const vTrack = currentStream.getVideoTracks()[0]
  const aTracks = currentStream.getAudioTracks()
  const settings = vTrack ? vTrack.getSettings() : {}
  return streamProblems({
    audioTracks: aTracks.length,
    displaySurface: settings.displaySurface,
  })
}

function updateUIState(): void {
  // Step 1 State
  if (rootDirectoryHandle) {
    step1BadgeEl.className = 'step-badge badge-done'
    step1BadgeEl.textContent = 'Concluído'
    step1StatusEl.replaceChildren()
    const prefix = document.createTextNode('Pasta selecionada: 📁 ')
    const strong = document.createElement('strong')
    strong.textContent = rootDirectoryHandle.name
    const br = document.createElement('br')
    const small = document.createElement('small')
    small.style.color = 'var(--text-sub)'
    small.textContent = 'Cada gravação criará sua própria subpasta YYYY-MM-DD-HHMMSS aqui dentro.'
    step1StatusEl.append(prefix, strong, br, small)
    btnChooseFolderEl.textContent = '📁 Trocar pasta'
    btnChooseFolderEl.disabled = isRecording
  } else {
    step1BadgeEl.className = 'step-badge badge-pending'
    step1BadgeEl.textContent = 'Pendente'
    step1StatusEl.textContent = 'Nenhuma pasta selecionada. Escolha a pasta raiz onde as subpastas das gravações serão armazenadas.'
    btnChooseFolderEl.textContent = '📁 Escolher pasta'
    btnChooseFolderEl.disabled = false
  }

  // Step 2 State
  const step2Available = rootDirectoryHandle !== null
  if (!step2Available) {
    step2CardEl.classList.add('disabled')
    step2BadgeEl.className = 'step-badge badge-pending'
    step2BadgeEl.textContent = 'Bloqueado'
    step2StatusEl.textContent = 'Bloqueado: selecione uma pasta no Passo 1 primeiro.'
    btnShareScreenEl.disabled = true
    btnShareAgainEl.style.display = 'none'
    streamProblemsEl.classList.remove('visible')
    videoWrapperEl.classList.remove('visible')
  } else {
    step2CardEl.classList.remove('disabled')
    btnShareScreenEl.disabled = isRecording
    btnShareAgainEl.disabled = isRecording

    if (!currentStream) {
      step2BadgeEl.className = 'step-badge badge-pending'
      step2BadgeEl.textContent = 'Pendente'
      step2StatusEl.textContent = 'Aguardando compartilhamento de tela. Clique no botão abaixo para selecionar a tela inteira com áudio do sistema.'
      btnShareScreenEl.style.display = 'inline-flex'
      btnShareAgainEl.style.display = 'none'
      streamProblemsEl.classList.remove('visible')
      videoWrapperEl.classList.remove('visible')
    } else {
      const problems = getStreamProblemsList()
      const vTrack = currentStream.getVideoTracks()[0]
      const settings = vTrack ? vTrack.getSettings() : {}
      const width = settings.width ?? videoPreviewEl.videoWidth ?? '-'
      const height = settings.height ?? videoPreviewEl.videoHeight ?? '-'
      const fps = settings.frameRate ? Math.round(settings.frameRate) : 30

      btnShareScreenEl.style.display = 'none'
      btnShareAgainEl.style.display = 'inline-flex'
      videoWrapperEl.classList.add('visible')

      if (problems.length > 0) {
        step2BadgeEl.className = 'step-badge badge-warn'
        step2BadgeEl.textContent = 'Problemas'
        step2StatusEl.innerHTML = `⚠️ <strong>Compartilhamento com problemas:</strong> ajuste as configurações de tela/áudio.`
        problemsListEl.innerHTML = problems.map((p) => `<li>${p}</li>`).join('')
        streamProblemsEl.classList.add('visible')
      } else {
        step2BadgeEl.className = 'step-badge badge-done'
        step2BadgeEl.textContent = 'Conectado'
        step2StatusEl.innerHTML = `Conectado: 🖥️ <strong>${width}×${height} @ ${fps} fps</strong> | 🔊 <strong>Áudio do sistema ativo</strong>`
        streamProblemsEl.classList.remove('visible')
      }
    }
  }

  // Step 3 State
  const problems = getStreamProblemsList()
  const step3Ready = rootDirectoryHandle !== null && currentStream !== null && problems.length === 0

  if (!step3Ready && !isRecording) {
    step3CardEl.classList.add('disabled')
    step3BadgeEl.className = 'step-badge badge-pending'
    step3BadgeEl.textContent = 'Bloqueado'
    step3StatusEl.textContent = 'Bloqueado: complete os passos 1 e 2 sem problemas para habilitar a gravação.'
    btnRecordEl.disabled = true
    btnRecordEl.className = 'btn btn-record'
    btnRecordEl.textContent = '▶ Gravar'
    if (!saveSummaryEl.classList.contains('visible')) {
      recordingSectionEl.classList.remove('visible')
    }
  } else if (!isRecording) {
    step3CardEl.classList.remove('disabled')
    step3BadgeEl.className = 'step-badge badge-done'
    step3BadgeEl.textContent = 'Pronto'
    step3StatusEl.textContent = 'Tudo pronto para gravar. Ao clicar em Gravar, uma nova subpasta YYYY-MM-DD-HHMMSS será criada.'
    btnRecordEl.disabled = isStopping
    btnRecordEl.className = 'btn btn-record'
    btnRecordEl.textContent = '▶ Gravar'
    recIndicatorEl.classList.remove('active')
    recStatusTextEl.textContent = 'PARADO'
    recordingSectionEl.classList.add('visible')
  } else {
    // Actively recording
    step3CardEl.classList.remove('disabled')
    step3BadgeEl.className = 'step-badge badge-warn'
    step3BadgeEl.textContent = 'Gravando'
    step3StatusEl.replaceChildren()
    const recPrefix = document.createTextNode('Gravando na subpasta: ')
    const code = document.createElement('code')
    code.textContent = currentSubfolderName
    step3StatusEl.append(recPrefix, code)
    btnRecordEl.disabled = isStopping
    btnRecordEl.className = 'btn btn-stop'
    btnRecordEl.textContent = '⏹ Parar gravação'
    recIndicatorEl.classList.add('active')
    recStatusTextEl.textContent = 'GRAVANDO'
    recordingSectionEl.classList.add('visible')
  }
}

async function handleChooseFolder(): Promise<void> {
  clearBanner()
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    rootDirectoryHandle = handle
    updateUIState()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return
    }
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      showError('Permissão negada para acessar a pasta local.')
    } else {
      showError(`Erro ao escolher pasta: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function teardownAudioPipeline(): Promise<void> {
  if (sourceNode) {
    try {
      sourceNode.disconnect()
    } catch {}
    sourceNode = null
  }
  if (workletNode) {
    workletNode.port.onmessage = null
    try {
      workletNode.disconnect()
    } catch {}
    workletNode = null
  }
  if (gainNode) {
    try {
      gainNode.disconnect()
    } catch {}
    gainNode = null
  }
  if (audioContext) {
    try {
      await audioContext.close()
    } catch {}
    audioContext = null
  }
  recentAudio.fill(0)
  recentAudioIndex = 0
  recentAudioFilled = 0
  currentPeak = 0
  currentRms = 0
  meterReadoutEl.textContent = 'RMS −60 dB · pico −60 dB'
  meterFillEl.style.width = '0%'
}

async function setupAudioPipeline(stream: MediaStream): Promise<void> {
  await teardownAudioPipeline()

  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    audioTrack = null
    return
  }

  audioTrack = audioTracks[0]
  audioContext = new AudioContext({ sampleRate: 48000 })
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  await audioContext.audioWorklet.addModule(workletUrl)
  sourceNode = audioContext.createMediaStreamSource(stream)
  workletNode = new AudioWorkletNode(audioContext, 'capture')
  gainNode = audioContext.createGain()
  gainNode.gain.value = 0

  sourceNode.connect(workletNode)
  workletNode.connect(gainNode)
  gainNode.connect(audioContext.destination)

  workletNode.port.onmessage = (e: MessageEvent<{ frame: number; samples: Float32Array }>) => {
    const { frame, samples } = e.data
    updateRecentAudio(samples)

    if (isRecording) {
      if (audioStartEpochMs === null && audioContext) {
        const ts = audioContext.getOutputTimestamp()
        const contextTime =
          typeof ts.contextTime === 'number' && !Number.isNaN(ts.contextTime)
            ? ts.contextTime
            : audioContext.currentTime
        const performanceTime =
          typeof ts.performanceTime === 'number' && !Number.isNaN(ts.performanceTime)
            ? ts.performanceTime
            : performance.now()
        audioStartEpochMs = epochOfFrame(
          frame,
          48000,
          { contextTime, performanceTime },
          performance.timeOrigin,
        )
      }
      recordedAudioChunks.push(samples)
      totalAudioSamplesRecorded += samples.length
    }
  }
}

async function handleShareScreen(): Promise<void> {
  clearBanner()
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include',
      monitorTypeSurfaces: 'include',
    } as DisplayMediaStreamOptions & { systemAudio?: string; monitorTypeSurfaces?: string })

    // If there's an existing stream, stop it
    if (currentStream) {
      for (const track of currentStream.getTracks()) {
        track.stop()
      }
      await teardownAudioPipeline()
    }

    currentStream = stream
    const vTracks = stream.getVideoTracks()
    videoTrack = vTracks[0] || null

    videoPreviewEl.srcObject = stream
    await videoPreviewEl.play().catch(() => {})

    // Guard onended by stream identity
    let streamEndedHandled = false
    const onEnded = async () => {
      if (streamEndedHandled || currentStream !== stream) {
        return
      }
      streamEndedHandled = true

      const wasRecording = isRecording
      let savedOk = true
      if (wasRecording) {
        savedOk = (await stopRecording()) ?? true
      }

      await teardownAudioPipeline()

      currentStream = null
      videoTrack = null
      audioTrack = null
      videoPreviewEl.srcObject = null
      updateUIState()

      if (wasRecording) {
        if (savedOk) {
          showNotice('Compartilhamento encerrado pelo Chrome: a gravação foi salva.')
        }
      } else {
        showNotice('Compartilhamento encerrado.')
      }
    }

    for (const track of stream.getTracks()) {
      track.onended = onEnded
    }

    await setupAudioPipeline(stream)

    // Ensure resolution updates in preview
    videoPreviewEl.onloadedmetadata = () => {
      updateUIState()
    }

    updateUIState()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      showNotice('Compartilhamento cancelado.')
    } else {
      showError(`Erro ao compartilhar tela: ${err instanceof Error ? err.message : String(err)}`)
    }
    updateUIState()
  }
}

async function startRecording(): Promise<void> {
  if (!rootDirectoryHandle || !currentStream || isRecording || isStopping) return

  clearBanner()
  saveSummaryEl.classList.remove('visible')

  if (!videoPreviewEl.videoWidth || !videoPreviewEl.videoHeight) {
    showError('Aguarde o carregamento do vídeo da tela antes de iniciar a gravação.')
    return
  }

  try {
    recordingStartTime = new Date()
    currentSubfolderName = formatSubfolderName(recordingStartTime)
    currentSessionDir = await rootDirectoryHandle.getDirectoryHandle(currentSubfolderName, { create: true })
    currentFramesDir = await currentSessionDir.getDirectoryHandle('frames', { create: true })

    recordedAudioChunks = []
    audioStartEpochMs = null
    totalAudioSamplesRecorded = 0
    framesWritten = 0
    framesSkipped = 0
    silentDurationMs = 0
    isWritingFrame = false
    isRecording = true
    window.addEventListener('beforeunload', onBeforeUnload)

    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    statSubfolderEl.textContent = currentSubfolderName

    // Set up offscreen canvas for frame capture
    const offscreen = new OffscreenCanvas(videoPreviewEl.videoWidth, videoPreviewEl.videoHeight)
    const ctx = offscreen.getContext('2d')

    // Capture frame every 100 ms
    frameIntervalTimer = window.setInterval(async () => {
      if (!isRecording) return

      if (isWritingFrame) {
        framesSkipped++
        return
      }

      if (videoPreviewEl.videoWidth === 0 || videoPreviewEl.videoHeight === 0) {
        return
      }

      if (offscreen.width !== videoPreviewEl.videoWidth || offscreen.height !== videoPreviewEl.videoHeight) {
        offscreen.width = videoPreviewEl.videoWidth
        offscreen.height = videoPreviewEl.videoHeight
      }

      isWritingFrame = true
      const epochMs = performance.timeOrigin + performance.now()

      try {
        ctx?.drawImage(videoPreviewEl, 0, 0)
        const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
        if (!currentFramesDir) return
        const fileName = `${Math.floor(epochMs)}.jpg`
        const fileHandle = await currentFramesDir.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        framesWritten++
      } catch (err) {
        showError(`Falha ao gravar quadro na pasta: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        isWritingFrame = false
      }
    }, 100)

    updateUIState()
  } catch (err) {
    window.removeEventListener('beforeunload', onBeforeUnload)
    showError(`Erro ao iniciar gravação na pasta: ${err instanceof Error ? err.message : String(err)}`)
    isRecording = false
    updateUIState()
  }
}

async function stopRecording(): Promise<boolean> {
  if (!isRecording || isStopping) return false
  isStopping = true
  window.removeEventListener('beforeunload', onBeforeUnload)

  // Stop frame loop
  if (frameIntervalTimer !== null) {
    clearInterval(frameIntervalTimer)
    frameIntervalTimer = null
  }
  isRecording = false

  // Wait for any active frame write to finish
  while (isWritingFrame) {
    await new Promise((r) => setTimeout(r, 20))
  }

  try {
    if (!currentSessionDir) {
      throw new Error('Pasta da sessão indisponível.')
    }

    // 1. Encode and write audio.wav
    const totalSamples = recordedAudioChunks.reduce((acc, c) => acc + c.length, 0)
    const combinedAudio = new Float32Array(totalSamples)
    let offset = 0
    for (const chunk of recordedAudioChunks) {
      combinedAudio.set(chunk, offset)
      offset += chunk.length
    }
    const wavBuffer = encodeWav(combinedAudio, 48000)
    const audioHandle = await currentSessionDir.getFileHandle('audio.wav', { create: true })
    const audioWritable = await audioHandle.createWritable()
    await audioWritable.write(wavBuffer)
    await audioWritable.close()

    // 2. Write session.json
    const vSettings = videoTrack ? videoTrack.getSettings() : ({} as MediaTrackSettings)
    const aSettings = audioTrack ? audioTrack.getSettings() : ({} as MediaTrackSettings)
    const sessionMeta: SessionMeta = {
      startedAt: recordingStartTime ? recordingStartTime.toISOString() : new Date().toISOString(),
      userAgent: navigator.userAgent,
      video: vSettings,
      audio: aSettings,
      sampleRate: 48000,
      audioStartEpochMs: audioStartEpochMs ?? performance.timeOrigin + performance.now(),
      frameIntervalMs: 100,
    }
    const sessionHandle = await currentSessionDir.getFileHandle('session.json', { create: true })
    const sessionWritable = await sessionHandle.createWritable()
    await sessionWritable.write(JSON.stringify(sessionMeta, null, 2))
    await sessionWritable.close()

    // 3. Show save summary
    const durationSec = recordingStartTime ? (Date.now() - recordingStartTime.getTime()) / 1000 : 0
    const audioSec = totalSamples / 48000

    summarySubfolderEl.textContent = currentSubfolderName
    summaryDurationEl.textContent = `${durationSec.toFixed(1)} s`
    summaryFramesEl.textContent = `${framesWritten} quadros (pulos: ${framesSkipped})`
    summaryAudioEl.textContent = `${audioSec.toFixed(1)} s (${totalSamples} amostras)`
    saveSummaryEl.classList.add('visible')
    return true
  } catch (err) {
    showError(`Falha ao salvar gravação: ${err instanceof Error ? err.message : String(err)}`)
    return false
  } finally {
    isStopping = false
    updateUIState()
  }
}

// Background loop for UI stats and audio meter (runs every 100ms)
uiUpdateTimer = window.setInterval(() => {
  // Update meter readout & fill
  const rmsDb = levelDb(currentRms)
  const peakDb = levelDb(currentPeak)
  meterReadoutEl.textContent = `RMS ${formatDb(rmsDb)} · pico ${formatDb(peakDb)}`
  const percent = Math.max(0, Math.min(100, ((peakDb + 60) / 60) * 100))
  meterFillEl.style.width = `${percent}%`

  if (videoTrack) {
    const s = videoTrack.getSettings()
    const w = s.width ?? videoPreviewEl.videoWidth ?? '-'
    const h = s.height ?? videoPreviewEl.videoHeight ?? '-'
    statResEl.textContent = `${w}×${h}`
  } else {
    statResEl.textContent = '-'
  }

  if (isRecording) {
    // Elapsed time
    const elapsedMs = recordingStartTime ? Date.now() - recordingStartTime.getTime() : 0
    const totalSecs = Math.floor(elapsedMs / 1000)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    const tenths = Math.floor((elapsedMs % 1000) / 100)
    statElapsedEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`

    statFramesEl.textContent = String(framesWritten)
    statSkippedEl.textContent = String(framesSkipped)
    statAudioEl.textContent = `${(totalAudioSamplesRecorded / 48000).toFixed(1)} s`

    // Silent warning check (> 3s of near silence while recording)
    if (currentPeak < 0.005) {
      silentDurationMs += 100
    } else {
      silentDurationMs = 0
    }

    if (silentDurationMs >= 3000) {
      silentWarningEl.classList.add('visible')
    } else {
      silentWarningEl.classList.remove('visible')
    }
  } else {
    silentWarningEl.classList.remove('visible')
    silentDurationMs = 0
  }
}, 100)

// Event Listeners
btnChooseFolderEl.addEventListener('click', handleChooseFolder)
btnShareScreenEl.addEventListener('click', handleShareScreen)
btnShareAgainEl.addEventListener('click', handleShareScreen)

btnRecordEl.addEventListener('click', () => {
  if (isRecording) {
    stopRecording()
  } else {
    startRecording()
  }
})

// Initial state update
updateUIState()
