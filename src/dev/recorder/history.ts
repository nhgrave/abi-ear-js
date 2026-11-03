/** Histórico: as gravações da pasta escolhida, com o resumo que o session.json (ou os arquivos) permitem. */
import { isRecordingName } from './format'
import { SAMPLE_RATE } from './wav'

export type RecordingSummary = {
  name: string
  status: 'complete' | 'failed' | 'incomplete' | 'prototype'
  startedAt: string | null
  durationS: number | null
  frames: number | null
  audioS: number | null
  resolution: [number, number] | null
  error: string | null
}

const WAV_HEADER = 44

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Resumo de uma gravação. `session` é o session.json já lido (null se faltou ou não é JSON); `frameCount` e
 * `wavBytes` vêm dos arquivos, para quando o session.json não traz o resumo (protótipo ou gravação interrompida). */
export function summarize(name: string, session: unknown, frameCount: number | null, wavBytes: number | null): RecordingSummary {
  const s = typeof session === 'object' && session !== null ? (session as Record<string, unknown>) : {}
  const startedAt = str(s.startedAt)
  const endedAt = str(s.endedAt)
  const video = typeof s.video === 'object' && s.video !== null ? (s.video as Record<string, unknown>) : {}
  const [w, h] = [num(video.width), num(video.height)]
  const wavAudioS = wavBytes !== null && wavBytes >= WAV_HEADER ? (wavBytes - WAV_HEADER) / 4 / SAMPLE_RATE : null

  let status: RecordingSummary['status']
  if (startedAt === null) status = 'incomplete'
  else if (endedAt !== null) status = str(s.error) !== null ? 'failed' : 'complete'
  else if (s.source === undefined && num(s.audioStartEpochMs) !== null) status = 'prototype'
  else status = 'incomplete'

  const samples = num(s.audioSamples)
  const failedAudio = status === 'failed' && s.audioSamples === null // o WAV não foi gravado
  const duration = endedAt !== null && startedAt !== null ? (Date.parse(endedAt!) - Date.parse(startedAt!)) / 1000 : NaN
  return {
    name,
    status,
    startedAt,
    durationS: Number.isFinite(duration) ? duration : null,
    frames: num(s.frames) ?? frameCount,
    audioS: samples !== null ? samples / SAMPLE_RATE : failedAudio ? null : wavAudioS,
    resolution: w !== null && h !== null ? [w, h] : null,
    error: str(s.error),
  }
}

async function readJson(dir: FileSystemDirectoryHandle, name: string): Promise<unknown> {
  try {
    return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text())
  } catch {
    return null
  }
}

async function fileSize(dir: FileSystemDirectoryHandle, name: string): Promise<number | null> {
  try {
    return (await (await dir.getFileHandle(name)).getFile()).size
  } catch {
    return null
  }
}

async function countFrames(dir: FileSystemDirectoryHandle): Promise<number> {
  try {
    const frames = await dir.getDirectoryHandle('frames')
    let n = 0
    for await (const e of frames.values()) if (e.kind === 'file' && e.name.endsWith('.jpg')) n++
    return n
  } catch {
    return 0
  }
}

/** As subpastas com nome de gravação, da mais nova para a mais antiga. Os quadros só são contados quando o
 * session.json não traz o total. */
export async function listRecordings(root: FileSystemDirectoryHandle): Promise<RecordingSummary[]> {
  const dirs: FileSystemDirectoryHandle[] = []
  for await (const e of root.values()) if (e.kind === 'directory' && isRecordingName(e.name)) dirs.push(e as FileSystemDirectoryHandle)
  dirs.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
  return Promise.all(
    dirs.map(async (d) => {
      const session = await readJson(d, 'session.json')
      const hasFrames = num((session as { frames?: unknown } | null)?.frames) !== null
      return summarize(d.name, session, hasFrames ? null : await countFrames(d), await fileSize(d, 'audio.wav'))
    }),
  )
}
