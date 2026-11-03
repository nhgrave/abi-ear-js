// Ritmo e gravação de quadros: garante intervalo mínimo e pula quadros se a escrita atrasar.

export class FrameRecorder<F> {
  private readonly intervalMs: number
  private readonly encode: (frame: F) => Promise<Blob>
  private readonly write: (name: string, data: Blob) => Promise<void>

  private lastEpochMs: number | null = null
  private pendingWrite: Promise<void> | null = null
  private stopped = false

  frames = 0
  skipped = 0
  error: string | null = null

  constructor(d: {
    intervalMs: number
    encode(frame: F): Promise<Blob>
    write(name: string, data: Blob): Promise<void>
  }) {
    this.intervalMs = d.intervalMs
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

    if (this.pendingWrite !== null) {
      this.skipped++
      this.lastEpochMs = epochMs
      return 'skipped'
    }

    this.lastEpochMs = epochMs
    const name = `${Math.floor(epochMs)}.jpg`

    try {
      const blobPromise = this.encode(frame)
      this.pendingWrite = blobPromise
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
          this.pendingWrite = null
        })
      return 'taken'
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      return 'stopped'
    }
  }

  async drain(): Promise<{ frames: number; skipped: number; error: string | null }> {
    this.stopped = true
    if (this.pendingWrite !== null) {
      await this.pendingWrite
    }
    return {
      frames: this.frames,
      skipped: this.skipped,
      error: this.error,
    }
  }
}
