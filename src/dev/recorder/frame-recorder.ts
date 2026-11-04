// Ritmo e gravação de quadros: garante intervalo mínimo e pula quadros quando já há `maxInFlight` sendo codificados
// ou escritos (um JPEG de 1080p leva uns 200 ms entre codificar e salvar: um de cada vez não passa de 5 por segundo).

export class FrameRecorder<F> {
  private readonly intervalMs: number
  private readonly maxInFlight: number
  private readonly encode: (frame: F) => Promise<Blob>
  private readonly write: (name: string, data: Blob) => Promise<void>

  private lastEpochMs: number | null = null
  private readonly inFlight = new Set<Promise<void>>()
  private stopped = false

  frames = 0
  skipped = 0
  error: string | null = null

  constructor(d: {
    intervalMs: number
    maxInFlight: number
    encode(frame: F): Promise<Blob>
    write(name: string, data: Blob): Promise<void>
  }) {
    this.intervalMs = d.intervalMs
    this.maxInFlight = d.maxInFlight
    this.encode = d.encode
    this.write = d.write
  }

  offer(frame: F, epochMs: number): 'taken' | 'early' | 'skipped' | 'stopped' {
    if (this.error !== null || this.stopped) {
      return 'stopped'
    }

    if (this.lastEpochMs !== null && epochMs - this.lastEpochMs < this.intervalMs) {
      return 'early'
    }

    if (this.inFlight.size >= this.maxInFlight) {
      this.skipped++
      this.lastEpochMs = epochMs
      return 'skipped'
    }

    this.lastEpochMs = epochMs
    const name = `${Math.floor(epochMs)}.jpg`

    try {
      const blobPromise = this.encode(frame)
      const job: Promise<void> = blobPromise
        .then((blob) => this.write(name, blob))
        .then(() => {
          this.frames++
        })
        .catch((err) => {
          if (!this.error) {
            this.error = err instanceof Error ? err.message : String(err)
          }
        })
        .finally(() => {
          this.inFlight.delete(job)
        })
      this.inFlight.add(job)
      return 'taken'
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      return 'stopped'
    }
  }

  async drain(): Promise<{ frames: number; skipped: number; error: string | null }> {
    this.stopped = true
    await Promise.all([...this.inFlight])
    return {
      frames: this.frames,
      skipped: this.skipped,
      error: this.error,
    }
  }
}
