export interface SessionMeta {
  startedAt: string
  userAgent: string
  video: MediaTrackSettings
  audio: MediaTrackSettings
  sampleRate: number
  audioStartEpochMs: number
  frameIntervalMs: number
}

/**
 * Encodes audio samples to a 32-bit IEEE float WAV file (mono, format 3).
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 32
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const headerSize = 44
  const totalSize = headerSize + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  // RIFF identifier
  view.setUint8(0, 'R'.charCodeAt(0))
  view.setUint8(1, 'I'.charCodeAt(0))
  view.setUint8(2, 'F'.charCodeAt(0))
  view.setUint8(3, 'F'.charCodeAt(0))

  // File length - 8
  view.setUint32(4, 36 + dataSize, true)

  // WAVE identifier
  view.setUint8(8, 'W'.charCodeAt(0))
  view.setUint8(9, 'A'.charCodeAt(0))
  view.setUint8(10, 'V'.charCodeAt(0))
  view.setUint8(11, 'E'.charCodeAt(0))

  // fmt chunk marker
  view.setUint8(12, 'f'.charCodeAt(0))
  view.setUint8(13, 'm'.charCodeAt(0))
  view.setUint8(14, 't'.charCodeAt(0))
  view.setUint8(15, ' '.charCodeAt(0))

  // Subchunk1Size (16 for PCM / IEEE float standard fmt)
  view.setUint32(16, 16, true)

  // AudioFormat (3 = IEEE float)
  view.setUint16(20, 3, true)

  // NumChannels (1 = mono)
  view.setUint16(22, numChannels, true)

  // SampleRate
  view.setUint32(24, sampleRate, true)

  // ByteRate
  view.setUint32(28, byteRate, true)

  // BlockAlign
  view.setUint16(32, blockAlign, true)

  // BitsPerSample
  view.setUint16(34, bitsPerSample, true)

  // data chunk marker
  view.setUint8(36, 'd'.charCodeAt(0))
  view.setUint8(37, 'a'.charCodeAt(0))
  view.setUint8(38, 't'.charCodeAt(0))
  view.setUint8(39, 'a'.charCodeAt(0))

  // Subchunk2Size (data size)
  view.setUint32(40, dataSize, true)

  // Sample data (Float32Array)
  const floatView = new Float32Array(buffer, headerSize, samples.length)
  floatView.set(samples)

  return buffer
}

/**
 * Returns the path inside the recording folder for a frame with the given epochMs.
 */
export function frameName(epochMs: number): string {
  return `frames/${Math.floor(epochMs)}.jpg`
}

/**
 * Computes the epoch timestamp in milliseconds of the given audio sample frame.
 * Formula: timeOrigin + ts.performanceTime + (frame / sampleRate - ts.contextTime) * 1000
 */
export function epochOfFrame(
  frame: number,
  sampleRate: number,
  ts: { contextTime: number; performanceTime: number },
  timeOrigin: number,
): number {
  return timeOrigin + ts.performanceTime + (frame / sampleRate - ts.contextTime) * 1000
}

/**
 * Returns any problems detected in the media stream in Brazilian Portuguese.
 * An empty array means recording can proceed.
 */
export function streamProblems(s: { audioTracks: number; displaySurface?: string }): string[] {
  const problems: string[] = []
  if (s.displaySurface && s.displaySurface !== 'monitor') {
    problems.push('Compartilhe a TELA INTEIRA, não uma janela ou aba.')
  }
  if (s.audioTracks < 1) {
    problems.push("Marque 'Compartilhar áudio do sistema' na janela do Chrome.")
  }
  return problems
}
