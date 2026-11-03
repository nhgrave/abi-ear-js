import { describe, expect, it } from 'vitest'
import { WavWriter, wavHeader, type WavSink } from './wav'

type Chunk = { type: 'write'; position: number; data: ArrayBuffer }

/** Sink em memória: aplica cada escrita na posição dela. `delay` decide quanto cada escrita demora; `fail` qual falha. */
function fakeSink(o: { delay?: (i: number) => number; fail?: (i: number) => boolean } = {}) {
  let bytes = new Uint8Array(0)
  let n = 0
  const sink = {
    closed: 0,
    bytes: () => bytes,
    async write(c: Chunk): Promise<void> {
      const i = n++
      const data = new Uint8Array(c.data.slice(0)) // cópia na hora: quem escreve pode mexer no buffer depois
      const d = o.delay?.(i) ?? 0
      if (d > 0) await new Promise((r) => setTimeout(r, d))
      if (o.fail?.(i)) throw new Error(`write ${i} failed`)
      const end = c.position + data.length
      if (end > bytes.length) {
        const grown = new Uint8Array(end)
        grown.set(bytes)
        bytes = grown
      }
      bytes.set(data, c.position)
    },
    async close(): Promise<void> {
      sink.closed++
    },
  }
  return sink satisfies WavSink & { closed: number; bytes: () => Uint8Array }
}

function concat(...parts: ArrayBuffer[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0))
  let at = 0
  for (const p of parts) {
    out.set(new Uint8Array(p), at)
    at += p.byteLength
  }
  return out
}

describe('wav', () => {
  it('header describes mono float32 at 48 kHz', () => {
    const v = new DataView(wavHeader(400))
    expect(v.byteLength).toBe(44)
    const ascii = (at: number) => String.fromCharCode(...new Uint8Array(v.buffer, at, 4))
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect([v.getUint32(4, true), v.getUint32(16, true), v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true)]).toEqual([436, 16, 3, 1, 48000])
    expect([v.getUint32(28, true), v.getUint16(32, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([192000, 4, 32, 400])
  })

  it('streamed file equals header plus all samples', async () => {
    const sink = fakeSink()
    const w = new WavWriter(sink)
    w.append(new Float32Array([0.1, -0.2]))
    w.append(new Float32Array([0.3]))
    expect(w.samples).toBe(3)
    expect(await w.finish()).toBe(3)
    expect(sink.bytes()).toEqual(concat(wavHeader(12), new Float32Array([0.1, -0.2, 0.3]).buffer))
    expect(sink.closed).toBe(1)
  })

  it('an empty recording is a valid header', async () => {
    const sink = fakeSink()
    expect(await new WavWriter(sink).finish()).toBe(0)
    expect(sink.bytes()).toEqual(new Uint8Array(wavHeader(0)))
  })

  it('appends without awaiting keep order', async () => {
    const sink = fakeSink({ delay: () => Math.floor(Math.random() * 4) })
    const w = new WavWriter(sink)
    const all = new Float32Array(100 * 256)
    for (let i = 0; i < all.length; i++) all[i] = Math.sin(i / 7)
    for (let k = 0; k < 100; k++) w.append(all.subarray(k * 256, (k + 1) * 256))
    expect(await w.finish()).toBe(all.length)
    expect(sink.bytes()).toEqual(concat(wavHeader(all.byteLength), all.buffer))
  })

  it('copies the samples it is given', async () => {
    const sink = fakeSink({ delay: () => 2 })
    const w = new WavWriter(sink)
    const buf = new Float32Array([1, 2])
    w.append(buf)
    buf.fill(9) // o worklet reaproveita ou transfere o buffer
    await w.finish()
    expect(sink.bytes()).toEqual(concat(wavHeader(8), new Float32Array([1, 2]).buffer))
  })

  it('a failing write rejects finish', async () => {
    const sink = fakeSink({ fail: (i) => i === 1 })
    const w = new WavWriter(sink)
    w.append(new Float32Array([1]))
    w.append(new Float32Array([2]))
    await expect(w.finish()).rejects.toThrow('write 1 failed')
  })
})
