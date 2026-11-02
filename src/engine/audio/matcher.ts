import FFT from 'fft.js'
import type { SoundHit } from '../candidates'
import { SAMPLE_RATE, bandpass } from './filter'

export { SAMPLE_RATE }
export const MIN_ENERGY = 1e-4 // abaixo disso o trecho é considerado silêncio
export const REF_SECONDS = 0.3 // só o ataque do som; caudas longas (até ~1 s) variam com a mixagem do jogo

export type Reference = { soundId: number; name: string; samples: Float32Array } // filtrado, média zero, norma 1

/** Remove o silêncio inicial e mantém REF_SECONDS a partir do ataque (ataque em 0.1 × o pico, 5 ms antes). */
export function trimReference(x: Float32Array): Float32Array {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  if (peak <= 0) return x.subarray(0, 0)
  const limit = 0.1 * peak
  let onset = 0
  while (Math.abs(x[onset]!) < limit) onset++
  const start = Math.max(0, onset - Math.floor(0.005 * SAMPLE_RATE))
  return x.subarray(start, start + Math.floor(REF_SECONDS * SAMPLE_RATE))
}

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(n, 2)))

export class SoundMatcher {
  references: Reference[] = []
  private ffts = new Map<number, FFT>()
  // (nfft, nº de referências) -> espectros complexos de cada par de referências
  private spectra = new Map<string, Float64Array[]>()

  /** `samples` já é mono 48 kHz: a página garante isso. */
  addReference(soundId: number, samples: Float32Array, name = ''): void {
    const t = trimReference(bandpass(samples))
    let mean = 0
    for (const v of t) mean += v
    mean /= t.length || 1
    const r = new Float32Array(t.length)
    let sq = 0
    for (let i = 0; i < t.length; i++) {
      r[i] = t[i]! - mean
      sq += r[i]! * r[i]!
    }
    const norm = Math.sqrt(sq)
    if (!(norm > 0)) return
    for (let i = 0; i < r.length; i++) r[i] = r[i]! / norm
    this.references.push({ soundId, name, samples: r })
    this.spectra.clear()
  }

  private fftOf(nfft: number): FFT {
    let f = this.ffts.get(nfft)
    if (!f) this.ffts.set(nfft, (f = new FFT(nfft)))
    return f
  }

  /** Espectro de (A invertida + i·B invertida) para cada par: a IFFT do produto devolve a correlação
   *  com A na parte real e com B na imaginária. */
  private pairSpectra(refs: Reference[], nfft: number): Float64Array[] {
    const key = `${nfft}:${refs.length}`
    let out = this.spectra.get(key)
    if (out) return out
    const fft = this.fftOf(nfft)
    out = []
    for (let p = 0; p < refs.length; p += 2) {
      const packed = fft.createComplexArray()
      const a = refs[p]!.samples
      for (let j = 0; j < a.length; j++) packed[2 * (a.length - 1 - j)] = a[j]!
      const b = refs[p + 1]?.samples
      if (b) for (let j = 0; j < b.length; j++) packed[2 * (b.length - 1 - j) + 1] = b[j]!
      const spec = fft.createComplexArray()
      fft.transform(spec, packed)
      out.push(spec)
    }
    if (this.spectra.size >= 4) this.spectra.delete(this.spectra.keys().next().value!) // escuta e identificação usam tamanhos diferentes
    this.spectra.set(key, out)
    return out
  }

  /** Melhor NCC de cada sound_id no trecho (mono, 48 kHz) e a amostra onde a referência começa.
   *  Uma FFT do trecho serve para todas as referências, o que permite ouvir continuamente. */
  peaks(clip: Float32Array): Map<number, [score: number, index: number]> {
    const best = new Map<number, [number, number]>()
    const x = bandpass(clip)
    const n = x.length
    const refs = this.references.filter((r) => r.samples.length <= n)
    if (!refs.length) return best
    // nfft >= n basta: o que dá a volta na correlação circular só cai antes de size - 1, que é descartado
    const nfft = nextPow2(n)
    const fft = this.fftOf(nfft)
    const spectra = this.pairSpectra(refs, nfft)

    const xc = fft.createComplexArray()
    for (let i = 0; i < n; i++) xc[2 * i] = x[i]!
    const X = fft.createComplexArray()
    fft.transform(X, xc)

    const sq = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) sq[i + 1] = sq[i]! + x[i]! * x[i]!

    const prod = fft.createComplexArray()
    const conv = fft.createComplexArray()
    for (let p = 0; p < spectra.length; p++) {
      const P = spectra[p]!
      for (let k = 0; k < 2 * nfft; k += 2) {
        prod[k] = X[k]! * P[k]! - X[k + 1]! * P[k + 1]!
        prod[k + 1] = X[k]! * P[k + 1]! + X[k + 1]! * P[k]!
      }
      fft.inverseTransform(conv, prod)
      for (let half = 0; half < 2; half++) {
        const ref = refs[2 * p + half]
        if (!ref) break
        const size = ref.samples.length
        let bestScore = -1
        let bestIndex = 0
        let any = false
        for (let i = 0; i + size <= n; i++) {
          const energy = Math.sqrt(Math.max(sq[i + size]! - sq[i]!, 0))
          if (!(energy > MIN_ENERGY)) continue
          any = true
          const ncc = conv[2 * (i + size - 1) + half]! / energy
          if (ncc > bestScore) {
            bestScore = ncc
            bestIndex = i
          }
        }
        if (!any) continue
        const prev = best.get(ref.soundId)
        if (bestScore > (prev ? prev[0] : -1)) best.set(ref.soundId, [bestScore, bestIndex])
      }
    }
    return best
  }

  /** Melhor NCC de cada sound_id dentro do trecho (mono, 48 kHz). */
  scores(clip: Float32Array): Map<number, number> {
    return new Map([...this.peaks(clip)].map(([id, [s]]) => [id, s]))
  }

  match(clip: Float32Array, threshold = 0.6, tieMargin = 0.05): SoundHit[] {
    const ranked = [...this.scores(clip)].sort((a, b) => b[1] - a[1])
    if (!ranked.length || ranked[0]![1] < threshold) return []
    const top = ranked[0]![1]
    return ranked.filter(([, s]) => s >= threshold && s >= top - tieMargin).map(([soundId, score]) => ({ soundId, score }))
  }
}
