import type { SoundHit } from '../candidates'
import { SAMPLE_RATE } from './filter'
import type { SoundMatcher } from './matcher'

export const LISTEN_WINDOW_S = 0.5 // cabe a referência (0,3 s) com folga para o início do som cair dentro
export const LISTEN_HOP_S = 0.1
export const TRIGGER_THRESHOLD = 0.7 // acima do da identificação: aqui um falso positivo vira um clique
export const REFRACTORY_S = 0.4 // o mesmo som aparece em várias janelas sobrepostas
export const SILENCE_PEAK = 1e-3
export const NEAR_MISS = 0.5 // abaixo do limite mas parecido: vai para o log (pegar que não disparou?)
export const CLIP_BEFORE_S = 0.1
export const CLIP_AFTER_S = 0.7

const BUFFER_S = 3

export type ListenEvent =
  | { kind: 'pickup'; t: number; soundId: number; score: number; hits: SoundHit[] }
  | { kind: 'near-miss'; t: number; soundId: number; score: number }

type Pending = { index: number; t: number; soundId: number; score: number } // index: amostra absoluta do início do som

/** Escuta contínua: roda o matcher em janelas de 0,5 s a cada 0,1 s (como `SoundTrigger` no Python) e,
 *  quando o buffer cobre t + CLIP_AFTER_S, identifica o som no trecho como `Controller.finish_click`. */
export class Listener {
  private buf = new Float32Array(BUFFER_S * SAMPLE_RATE)
  private total = 0 // amostras recebidas desde o início
  private nextEnd = Math.round(LISTEN_WINDOW_S * SAMPLE_RATE) // fim (absoluto) da próxima janela
  private anchors: { index: number; tMs: number }[] = [] // tempo (ms) do primeiro sample de cada bloco
  private lastMs: number | null = null
  private lastMissMs: number | null = null
  private pending: Pending[] = []

  constructor(private matcher: SoundMatcher) {}

  /** `samples` começa em `tStartMs` (ms, mesma base de tempo dos quadros). */
  push(samples: Float32Array, tStartMs: number): ListenEvent[] {
    const cap = this.buf.length
    this.anchors.push({ index: this.total, tMs: tStartMs })
    const tail = samples.length > cap ? samples.subarray(samples.length - cap) : samples
    const base = this.total + samples.length - tail.length
    for (let i = 0; i < tail.length; i++) this.buf[(base + i) % cap] = tail[i]!
    this.total += samples.length
    // descarta âncoras que já saíram do buffer, mantendo a última delas
    const oldest = this.total - cap
    while (this.anchors.length > 1 && this.anchors[1]!.index <= oldest) this.anchors.shift()

    const events: ListenEvent[] = []
    const win = Math.round(LISTEN_WINDOW_S * SAMPLE_RATE)
    const hop = Math.round(LISTEN_HOP_S * SAMPLE_RATE)
    while (this.nextEnd <= this.total) {
      const end = this.nextEnd
      this.nextEnd += hop
      if (end - win < oldest) continue // a janela já saiu do buffer (bloco enorme)
      this.feedWindow(end - win, end, events)
    }
    this.flushPending(events)
    return events
  }

  private timeOf(index: number): number {
    let a = this.anchors[0]!
    for (const c of this.anchors) if (c.index <= index) a = c
    return a.tMs + ((index - a.index) * 1000) / SAMPLE_RATE
  }

  private slice(from: number, to: number): Float32Array {
    const cap = this.buf.length
    const out = new Float32Array(to - from)
    for (let i = 0; i < out.length; i++) out[i] = this.buf[(from + i) % cap]!
    return out
  }

  private feedWindow(from: number, to: number, events: ListenEvent[]): void {
    const clip = this.slice(from, to)
    let peak = 0
    for (const v of clip) peak = Math.max(peak, Math.abs(v))
    if (peak < SILENCE_PEAK) return
    const peaks = this.matcher.peaks(clip)
    let soundId = -1
    let score = -Infinity
    let index = 0
    for (const [id, [s, i]] of peaks) {
      if (s > score) {
        soundId = id
        score = s
        index = i
      }
    }
    if (soundId < 0) return
    const abs = from + index
    const t = this.timeOf(abs)
    const refractoryMs = REFRACTORY_S * 1000
    if (score < TRIGGER_THRESHOLD) {
      if (score >= NEAR_MISS && (this.lastMissMs === null || Math.abs(t - this.lastMissMs) >= refractoryMs)) {
        this.lastMissMs = t
        events.push({ kind: 'near-miss', t, soundId, score })
      }
      return
    }
    if (this.lastMs !== null && Math.abs(t - this.lastMs) < refractoryMs) return
    this.lastMs = t
    this.pending.push({ index: abs, t, soundId, score })
  }

  private flushPending(events: ListenEvent[]): void {
    const after = Math.round(CLIP_AFTER_S * SAMPLE_RATE)
    const before = Math.round(CLIP_BEFORE_S * SAMPLE_RATE)
    while (this.pending.length && this.pending[0]!.index + after <= this.total) {
      const p = this.pending.shift()!
      const from = Math.max(p.index - before, this.total - this.buf.length, 0)
      const hits = this.matcher.match(this.slice(from, p.index + after))
      events.push({ kind: 'pickup', t: p.t, soundId: p.soundId, score: p.score, hits })
    }
  }
}
