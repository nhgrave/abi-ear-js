/** WAV mono float32 (formato 3) escrito em pedaços durante a gravação, sem guardar o áudio na memória. */

export const SAMPLE_RATE = 48000
const HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 4

/** O subconjunto do FileSystemWritableFileStream que o WavWriter usa. */
export type WavSink = {
  write(c: { type: 'write'; position: number; data: ArrayBuffer }): Promise<void>
  close(): Promise<void>
}

function ascii(v: DataView, at: number, s: string): void {
  for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i))
}

/** Cabeçalho de 44 bytes para `dataBytes` bytes de amostras. */
export function wavHeader(dataBytes: number, sampleRate = SAMPLE_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES)
  const v = new DataView(buf)
  ascii(v, 0, 'RIFF')
  v.setUint32(4, 36 + dataBytes, true)
  ascii(v, 8, 'WAVE')
  ascii(v, 12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 3, true) // IEEE float
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)
  v.setUint16(32, BYTES_PER_SAMPLE, true)
  v.setUint16(34, 32, true)
  ascii(v, 36, 'data')
  v.setUint32(40, dataBytes, true)
  return buf
}

/** `append` não precisa de await: cada bloco entra numa fila, na posição calculada na hora. `finish` espera a fila,
 * corrige os tamanhos no cabeçalho e fecha. O primeiro erro de escrita rejeita o `finish`. */
export class WavWriter {
  private queue: Promise<void>
  private failure: unknown = null
  private count = 0

  constructor(
    private sink: WavSink,
    private sampleRate = SAMPLE_RATE,
  ) {
    this.queue = Promise.resolve()
    this.enqueue(0, wavHeader(0, sampleRate)) // provisório até o finish
  }

  get samples(): number {
    return this.count
  }

  /** O primeiro erro de escrita, assim que acontece (null enquanto tudo vai bem). */
  get error(): unknown {
    return this.failure
  }

  append(samples: Float32Array): void {
    if (samples.length === 0) return
    const position = HEADER_BYTES + this.count * BYTES_PER_SAMPLE
    this.count += samples.length
    this.enqueue(position, samples.slice().buffer) // cópia: o buffer de quem chama pode ser reaproveitado
  }

  async finish(): Promise<number> {
    this.enqueue(0, wavHeader(this.count * BYTES_PER_SAMPLE, this.sampleRate))
    await this.queue
    if (this.failure !== null) {
      await this.sink.close().catch(() => {}) // fecha o que der; o erro que vale é o da escrita
      throw this.failure
    }
    await this.sink.close()
    return this.count
  }

  private enqueue(position: number, data: ArrayBuffer): void {
    this.queue = this.queue.then(async () => {
      if (this.failure !== null) return // depois do primeiro erro, nada mais é escrito
      try {
        await this.sink.write({ type: 'write', position, data })
      } catch (err) {
        this.failure = err
      }
    })
  }
}
