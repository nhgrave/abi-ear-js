export const SAMPLE_RATE = 48000
export const BAND_HZ = [1200, 8000] as const // acima de ~8 kHz o som do jogo chega atenuado e pouco correlacionado com a referência

/** Igual a `butter(4, (1200, 8000), 'bandpass', fs=48000, output='sos')` do scipy. */
export const SOS: readonly (readonly number[])[] = [
  [0.015411424043869791, 0.030822848087739583, 0.015411424043869791, 1.0, -0.8165903221634706, 0.23017847869537056],
  [1.0, 2.0, 1.0, 1.0, -0.8273956201935653, 0.5955932048558765],
  [1.0, -2.0, 1.0, 1.0, -1.6784950090113542, 0.713149382596639],
  [1.0, -2.0, 1.0, 1.0, -1.8845449347003125, 0.9092507654156495],
]

/** `sosfilt` do scipy: estado inicial zero, forma direta II transposta, em Float64 internamente. */
export function bandpass(x: Float32Array): Float32Array {
  const n = x.length
  const cur = new Float64Array(x)
  for (const [b0, b1, b2, , a1, a2] of SOS) {
    let z1 = 0
    let z2 = 0
    for (let i = 0; i < n; i++) {
      const v = cur[i]!
      const y = b0! * v + z1
      z1 = b1! * v - a1! * y + z2
      z2 = b2! * v - a2! * y
      cur[i] = y
    }
  }
  return new Float32Array(cur)
}
