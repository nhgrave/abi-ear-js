/** Formato de uma gravação (o mesmo do protótipo, que o replay e o construtor de modelos leem):
 * `<AAAA-MM-DD-HHMMSS>/session.json`, `audio.wav` e `frames/<epochMs>.jpg`. */

export type SessionFile = {
  startedAt: string
  userAgent: string
  video: MediaTrackSettings
  audio: MediaTrackSettings
  sampleRate: 48000
  audioStartEpochMs: number | null // null até chegar a primeira amostra
  frameIntervalMs: number
  // campos novos: quem lê só os do protótipo ignora
  source: 'abi-ear-js'
  appVersion: string
  displaySurface: string | null
  endedAt?: string
  frames?: number
  framesSkipped?: number
  audioSamples?: number | null // null: a escrita do áudio falhou
  error?: string // por que a gravação parou, se foi por erro
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Nome da subpasta pela hora local do início, como o protótipo. */
export function recordingName(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function isRecordingName(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(name)
}

/** O session.json escrito ao começar: sem fim, para uma gravação interrompida aparecer como incompleta. */
export function startSession(o: {
  startedAt: Date
  userAgent: string
  video: MediaTrackSettings
  audio: MediaTrackSettings
  appVersion: string
  frameIntervalMs: number
}): SessionFile {
  const surface = (o.video as MediaTrackSettings & { displaySurface?: string }).displaySurface
  return {
    startedAt: o.startedAt.toISOString(),
    userAgent: o.userAgent,
    video: o.video,
    audio: o.audio,
    sampleRate: 48000,
    audioStartEpochMs: null,
    frameIntervalMs: o.frameIntervalMs,
    source: 'abi-ear-js',
    appVersion: o.appVersion,
    displaySurface: surface ?? null,
  }
}

/** O session.json final. Sem nenhuma amostra de áudio, o início do áudio vira `fallbackEpochMs`, como no protótipo. */
export function finishSession(
  s: SessionFile,
  o: {
    endedAt: Date
    frames: number
    framesSkipped: number
    audioSamples: number | null
    audioStartEpochMs: number | null
    fallbackEpochMs: number
    error: string | null
  },
): SessionFile {
  return {
    ...s,
    ...(o.error !== null ? { error: o.error } : {}),
    audioStartEpochMs: o.audioStartEpochMs ?? o.fallbackEpochMs,
    endedAt: o.endedAt.toISOString(),
    frames: o.frames,
    framesSkipped: o.framesSkipped,
    audioSamples: o.audioSamples,
  }
}
